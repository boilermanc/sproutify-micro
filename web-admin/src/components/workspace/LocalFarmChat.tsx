import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUp, MessageCircle, X } from 'lucide-react';
import FarmWorkDialog from './FarmWorkDialog';
import FarmRealtimeControls from './FarmRealtimeControls';
import { fetchGrowingWorkspace } from '@/services/workspaceTasks';
import type { DailyTask } from '@/services/dailyFlowService';
import type { WorkInput } from './farmWorkActions';
import { growingSummary, matchingFarmTasks, nextWorkSummary, parseFarmCommand, type FarmCommand } from '@/lib/farmConversation';
import { taskTrayCount, taskWorkLabel } from '@/lib/todayWorkspace';
import { converseWithFarm, farmConversationSnapshot, getFarmAIStatus, responseLabels, type FarmAIReply, type ResponseCategory } from '@/services/farmConversationAI';
import './LocalFarmChat.css';

type Report = Extract<FarmCommand, { type: 'report' }>;
type Draft = { task: DailyTask; command: Report };
type Message = { role: 'user' | 'assistant'; text: string; category?: ResponseCategory };
const identity = () => {
  try {
    const session = JSON.parse(localStorage.getItem('sproutify_session') || '{}');
    return session.farmUuid && session.userId ? `${session.userId}:${session.farmUuid}:${session.role}` : '';
  } catch { return ''; }
};

/** Read-only farm conversation. Proposals open shared review, never a work writer. */
export default function LocalFarmChat({ conversationMode = 'ai' }: { conversationMode?: 'ai' | 'commands' }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<DailyTask[]>([]);
  const [command, setCommand] = useState<Report | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [review, setReview] = useState<{ task: DailyTask; input: Partial<WorkInput> } | null>(null);
  const [mode, setMode] = useState(conversationMode);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const generation = useRef(0);
  const owner = useRef(identity());
  const inputRef = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const chatLog = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const visible = pathname === '/today' || pathname === '/growing';
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (!visible || identity() !== owner.current) {
      generation.current++; inFlight.current = false; owner.current = identity();
      setOpen(false); setMessages([]); setChoices([]); setCommand(null); setDraft(null); setReview(null); setBusy(false);
    }
  }, [visible, pathname]);
  useEffect(() => { if (open && !review) inputRef.current?.focus(); }, [open, review]);
  useEffect(() => { chatLog.current?.scrollTo?.({ top: chatLog.current.scrollHeight }); }, [messages, choices]);
  useEffect(() => {
    if (!open || mode !== 'ai') return;
    let active = true;
    getFarmAIStatus().then(ready => { if (active) setAiReady(ready); }).catch(() => { if (active) setAiReady(false); });
    return () => { active = false; };
  }, [open, mode]);
  const say = (text: string, category: ResponseCategory = 'info') => setMessages(current => [...current, { role: 'assistant', text, category }]);

  function choose(task: DailyTask, report: Report, announce = true) {
    if (identity() !== owner.current) { say('Your farm session changed. Close and reopen chat before continuing.'); return; }
    const count = report.quantity;
    setChoices([]);
    if (count !== undefined && count > taskTrayCount(task)) {
      setDraft({ task, command: report });
      say(`That group has ${taskTrayCount(task)} trays remaining. Correct the draft, for example “Actually two trays”. Nothing has been saved.`, 'clarify');
      return;
    }
    setDraft({ task, command: report });
    if (announce) say(`Draft: ${taskWorkLabel(task)} · ${task.crop} · ${task.location || 'location not set'}${count === undefined ? '. Choose the completed quantity or watering result in the review form' : ` · ${count} whole trays`}. Nothing has been saved. You can correct the count, cancel, or review the work form.`, 'draft');
  }

  function applyAnswer(answer: FarmAIReply, data: Awaited<ReturnType<typeof fetchGrowingWorkspace>>) {
    if (answer.draftDisposition === 'discard') { setDraft(null); setCommand(null); }
    const proposal = answer.proposal;
    if (proposal) {
      const report: Report = { type: 'report', kind: proposal.kind, subject: '', quantity: proposal.quantity ?? undefined, watering: proposal.watering === 'unspecified' ? undefined : proposal.watering, watered: proposal.watered };
      setCommand(report); setDraft(null);
      if (proposal.taskId) { const selected = data.tasks.find(task => task.id === proposal.taskId); if (selected) choose(selected, report, false); }
      else setChoices(data.tasks.filter(task => answer.candidateTaskIds.includes(task.id)));
    } else { setCommand(null); setChoices(data.tasks.filter(task => answer.candidateTaskIds.includes(task.id))); }
  }

  async function readVoiceFarm(signal: AbortSignal) {
    const actor = identity(); const id = generation.current;
    const data = await fetchGrowingWorkspace();
    if (signal.aborted || id !== generation.current || actor !== identity() || actor !== owner.current) throw new Error('Voice farm changed.');
    return { ...farmConversationSnapshot('', data, [], draft ? { taskId: draft.task.id, quantity: draft.command.quantity ?? null } : null), writesEnabled: false };
  }

  async function reviewVoiceWork(report: string, signal: AbortSignal) {
    const actor = identity(); const id = generation.current;
    const data = await fetchGrowingWorkspace();
    if (signal.aborted || id !== generation.current || actor !== identity() || actor !== owner.current) throw new Error('Voice farm changed.');
    const answer = await converseWithFarm(report, data, messages, draft ? { taskId: draft.task.id, quantity: draft.command.quantity ?? null } : null);
    if (signal.aborted || id !== generation.current || actor !== identity() || actor !== owner.current) throw new Error('Voice farm changed.');
    applyAnswer(answer, data); return answer;
  }

  async function send(text: string) {
    if (inFlight.current || !text.trim()) return;
    const sessionIdentity = identity();
    if (!sessionIdentity || sessionIdentity !== owner.current) {
      owner.current = sessionIdentity; setMessages([{ role: 'assistant', text: 'The farm session changed. Open the farm again before continuing; the previous conversation has been cleared.' }]);
      setDraft(null); setChoices([]); setCommand(null); return;
    }
    setInput(''); setMessages(current => [...current, { role: 'user', text }]);
    const parsed = parseFarmCommand(text);
    if (parsed.type === 'cancel') { setDraft(null); setChoices([]); setCommand(null); say('Draft discarded. No farm records were changed.'); return; }
    if (mode === 'ai') {
      inFlight.current = true; setBusy(true); setChoices([]);
      const id = ++generation.current;
      try {
        const data = await fetchGrowingWorkspace();
        if (id !== generation.current || sessionIdentity !== identity()) return;
        const answer = await converseWithFarm(text, data, messages, draft ? { taskId: draft.task.id, quantity: draft.command.quantity ?? null } : null);
        if (id !== generation.current || sessionIdentity !== identity()) return;
        say(answer.message, answer.category); setAiReady(true);
        applyAnswer(answer, data);
      } catch (error) {
        if (id === generation.current) say(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The AI took too long to answer. No work has been saved. Try again.', 'caution');
      } finally { if (id === generation.current) { inFlight.current = false; setBusy(false); } }
      return;
    }
    if (parsed.type === 'correction') {
      if (!draft) { say('There is no selected draft to correct. Tell me the action and crop first.'); return; }
      choose(draft.task, { ...draft.command, quantity: parsed.quantity }); return;
    }
    setChoices([]); setCommand(null); setDraft(null);
    if (parsed.type === 'unsupported') { say(parsed.message); return; }
    inFlight.current = true; setBusy(true);
    const id = ++generation.current;
    try {
      const data = await fetchGrowingWorkspace();
      if (id !== generation.current || sessionIdentity !== identity()) return;
      if (parsed.type === 'next') {
        const result = nextWorkSummary(data.tasks); say(result.text, 'next'); setChoices(result.tasks);
      } else if (parsed.type === 'growing') say(growingSummary(data.groups));
      else {
        const matches = matchingFarmTasks(parsed, data.tasks);
        setCommand(parsed);
        if (!matches.length) say('I could not match that to an available task in Today or Growing. No work has been saved. Check the crop name and task in Growing; I cannot create a planting request from this command.');
        else if (matches.length > 1) { setChoices(matches); say('Which work group do you mean? Choose the crop, location and date below. Nothing has been saved.', 'clarify'); }
        else choose(matches[0], parsed);
      }
    } catch { if (id === generation.current) say('I could not refresh the farm tasks. I cannot confirm what needs doing or prepare a record. Please try again. Nothing has been saved.', 'caution'); }
    finally { if (id === generation.current) { inFlight.current = false; setBusy(false); } }
  }

  async function openReview() {
    if (!draft || inFlight.current) return;
    const sessionIdentity = identity();
    if (!sessionIdentity || sessionIdentity !== owner.current) { say('The farm session changed. Close and reopen chat before continuing.'); setDraft(null); return; }
    inFlight.current = true; setBusy(true);
    const id = ++generation.current;
    try {
      const data = await fetchGrowingWorkspace();
      if (id !== generation.current || sessionIdentity !== identity()) return;
      const fresh = matchingFarmTasks(draft.command, data.tasks).find(task => task.id === draft.task.id);
      if (!fresh || draft.command.quantity !== undefined && draft.command.quantity > taskTrayCount(fresh)) {
        setDraft(null); say('That task changed. Ask again using the refreshed task list before reviewing. Nothing has been saved.'); return;
      }
      const { quantity, watering, kind } = draft.command;
      const initial: Partial<WorkInput> = {};
      if (kind === 'seed' || kind === 'soak') initial.quantity = quantity === undefined ? '' : String(quantity);
      else if (kind === 'harvest' || kind === 'water') {
        // A count does not identify individual trays. Never pick arbitrary trays.
        if (watering === 'all' || quantity === new Set(fresh.trayIds).size && (kind === 'harvest' || draft.command.watered)) initial.trayIds = [...new Set(fresh.trayIds)];
        else if (watering === 'none' || kind === 'harvest') initial.trayIds = [];
      }
      setReview({ task: fresh, input: initial });
    } catch { if (id === generation.current) say('The task could not be refreshed for review. Nothing has been saved. Try again.'); }
    finally { if (id === generation.current) { inFlight.current = false; setBusy(false); } }
  }

  if (!visible) return null;
  const interactionBusy = busy || voiceBusy;
  return <>
    <button ref={launcher} className="farm-chat-launcher" aria-expanded={open} aria-controls="local-farm-chat" onClick={() => setOpen(value => !value)}><MessageCircle size={20} />Chat with your farm</button>
    {open && <section id="local-farm-chat" aria-label="Chat with your farm" className="farm-chat-panel" onKeyDown={event => { if (event.key === 'Escape' && !review) { setOpen(false); launcher.current?.focus(); } }}>
      <header><div><h2>Your farm assistant</h2><p>{mode === 'ai' ? 'Farm conversation' : 'Simple commands'} · saving disabled</p></div><button aria-label="Close farm chat" onClick={() => { setOpen(false); launcher.current?.focus(); }}><X size={20} /></button></header>
      <div className="farm-chat-mode"><button disabled={interactionBusy} onClick={() => { setMode(value => value === 'ai' ? 'commands' : 'ai'); setChoices([]); setCommand(null); }}>{mode === 'ai' ? 'Use simple commands' : 'Use AI conversation'}</button>{mode === 'ai' && <span role="status">{aiReady === null ? 'Checking AI…' : aiReady ? 'AI available' : 'AI unavailable'}</span>}<details><summary>Response colors</summary><div className="farm-chat-legend">{Object.entries(responseLabels).map(([key, label]) => <span key={key} className={`farm-chat-label farm-chat-tone-${key}`}>{label}</span>)}</div></details></div>
      <div className="farm-chat-log" ref={chatLog} role="log" aria-live="polite">
        <p>Ask what’s next, see what’s growing, or tell me one job you finished. I’ll match the task and help you review it.</p>
        <p className="farm-chat-note">{mode === 'ai' ? 'Type or tap voice to talk. Audio and relevant farm details go to OpenAI. Replies use an AI-generated voice. Drafts stay unsaved.' : 'Simple mode uses the examples below without calling AI. Drafts stay unsaved.'}</p>
        {messages.map((message, index) => <div key={index} className={`farm-chat-message farm-chat-${message.role} ${message.role === 'assistant' ? `farm-chat-tone-${message.category || 'info'}` : ''}`}>{message.role === 'assistant' && <span className="farm-chat-label">{responseLabels[message.category || 'info']}</span>}<p>{message.text}</p></div>)}
        {busy && <p role="status">{mode === 'ai' ? 'Reading farm records and thinking…' : 'Refreshing farm records…'}</p>}
        {!interactionBusy && choices.map(task => <button className="farm-chat-choice" key={task.id} onClick={() => {
          if (mode === 'ai' && !command) { void send(`I mean the ${task.crop} group at ${task.location || 'location not set'}, task ${task.id}.`); return; }
          if (!command && !/^(seed|soak)$|harvest|water/i.test(task.action)) { say('Open Today to review this recipe step. This local chat supports seeding, soaking, checking/watering and whole-tray harvest review.'); return; }
          choose(task, command || { type: 'report', kind: /^seed$/i.test(task.action) ? 'seed' : /^soak$/i.test(task.action) ? 'soak' : /harvest/i.test(task.action) ? 'harvest' : 'water', subject: task.crop });
        }}>{taskWorkLabel(task)} · {task.crop} · {task.location || 'location not set'} · {taskTrayCount(task)} trays{task.sowDate ? ` · ${task.sowDate.slice(0, 10)}` : ''}</button>)}
        {draft && <div className="farm-chat-draft"><p>Unsaved draft · {draft.task.crop}{draft.command.quantity !== undefined ? ` · ${draft.command.quantity} trays` : ''}</p><button disabled={interactionBusy || (draft.command.quantity !== undefined && draft.command.quantity > taskTrayCount(draft.task))} onClick={() => void openReview()}>Review work form</button><button disabled={interactionBusy} onClick={() => void send('Cancel')}>Discard draft</button></div>}
      </div>
      <details className="farm-chat-examples" open={mode === 'commands'}><summary>Example questions</summary>{['What’s next?', 'What’s growing?', 'I seeded two trays of radish'].map(example => <button key={example} disabled={interactionBusy} onClick={() => void send(example)}>{example}</button>)}</details>
      <form className="farm-chat-composer" onSubmit={event => { event.preventDefault(); if (!interactionBusy) void send(input); }}>
        <label className="sr-only" htmlFor="farm-chat-input">Message your farm</label><input ref={inputRef} id="farm-chat-input" value={input} readOnly={voiceBusy} maxLength={1000} onChange={event => setInput(event.target.value)} placeholder="Message your farm…" />
        {mode === 'ai' && <FarmRealtimeControls active={open && !review} busy={busy} identity={owner.current} history={messages} onBusyChange={setVoiceBusy}
          onUser={text => setMessages(current => [...current, { role: 'user', text }])} onAssistant={say} readFarm={readVoiceFarm} reviewWork={reviewVoiceWork} />}
        <button aria-label="Send message" title="Send message" className="farm-chat-send" disabled={interactionBusy || !input.trim()} type="submit"><ArrowUp size={20} aria-hidden="true" /></button>
      </form>
      <footer><Link to="/today" onClick={() => setOpen(false)}>Today</Link><Link to="/growing" onClick={() => setOpen(false)}>Growing</Link><span>Review only · production saves disabled</span></footer>
    </section>}
    <FarmWorkDialog task={review?.task || null} initialInput={review?.input} previewOnly onClose={() => setReview(null)} onSaved={() => { /* Preview never calls a writer or reports success. */ }} />
  </>;
}
