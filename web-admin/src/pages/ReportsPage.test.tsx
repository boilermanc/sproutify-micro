import '@testing-library/jest-dom/vitest';
import {useEffect} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import ReportsPage from './ReportsPage';
const f=vi.hoisted(()=>({mounts:0}));
vi.mock('../components/reports/HarvestReport',()=>({default:function Preview({startDate,endDate}:{startDate:Date,endDate:Date}){
  useEffect(()=>{f.mounts++;},[]);
  return <output data-testid="range">{JSON.stringify({startDay:startDate.getDate(),startHour:startDate.getHours(),endDay:endDate.getDate(),endHour:endDate.getHours()})}</output>;
}}));
vi.mock('../components/reports/DeliveryReport',()=>({default:()=>null}));
vi.mock('../components/reports/SalesReport',()=>({default:()=>null}));
vi.mock('../components/reports/SeedUsageReport',()=>({default:()=>null}));
beforeEach(()=>{f.mounts=0;vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,18,12));});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('passes the entire selected local calendar range to reports',()=>{
  render(<ReportsPage/>);
  expect(JSON.parse(screen.getByTestId('range').textContent||'{}')).toEqual({startDay:11,startHour:0,endDay:18,endHour:23});
});
it('refreshes the real preview rather than claiming an external report was generated',()=>{
  render(<ReportsPage/>);expect(f.mounts).toBe(1);
  fireEvent.click(screen.getByRole('button',{name:'Refresh Preview'}));expect(f.mounts).toBe(2);
  expect(screen.queryByRole('button',{name:'Generate Report'})).not.toBeInTheDocument();
});
it('blocks an inverted date range and removes stale preview data',()=>{
  render(<ReportsPage/>);fireEvent.change(screen.getByLabelText('Start Date'),{target:{value:'2026-10-20'}});
  expect(screen.getByRole('alert')).toHaveTextContent('on or before');
  expect(screen.queryByTestId('range')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Refresh Preview'})).toBeDisabled();
});
