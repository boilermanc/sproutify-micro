# Sproutify Micro - Complete Setup Guide

This guide will walk you through setting up the entire Sproutify Micro application suite.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#supabase-setup)
3. [Marketing Site Setup](#marketing-site-setup)
4. [Web Admin Setup](#web-admin-setup)
5. [Mobile App Setup](#mobile-app-setup)
6. [n8n Integration Setup](#n8n-integration-setup)
7. [Testing](#testing)
8. [Deployment](#deployment)

## Prerequisites

Before you begin, ensure you have:

- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Git](https://git-scm.com/)
- [Supabase Account](https://supabase.com/)
- [n8n Instance](https://n8n.io/) (self-hosted or cloud)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) for mobile development
- Code editor (VS Code recommended)

## Supabase Setup

### 1. Create Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Fill in:
   - Project name: `Sproutify Micro`
   - Database password: (save this securely)
   - Region: Choose closest to your users
4. Click "Create new project"

### 2. Get API Credentials

1. Go to Project Settings > API
2. Copy:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - `anon` public key

### 3. Run Database Migration

Option A: Using Supabase Dashboard
1. Go to SQL Editor
2. Copy contents of `supabase/migrations/001_initial_schema.sql`
3. Paste and run

Option B: Using Supabase CLI
```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push migration
supabase db push
```

### 4. Deploy Edge Functions

```bash
cd supabase/functions

# Deploy create-tray function
supabase functions deploy create-tray

# Deploy record-harvest function
supabase functions deploy record-harvest

# Deploy generate-labels function
supabase functions deploy generate-labels
```

### 5. Set Environment Variables for Functions

In Supabase Dashboard > Edge Functions > Secrets, add:
```
N8N_LABEL_WEBHOOK_URL=https://your-n8n-instance.com/webhook/generate-labels
```

### 6. Create Test Data (Optional)

Run this SQL in the SQL Editor:

```sql
-- Create a test farm
INSERT INTO farms (farm_name, is_active)
VALUES ('Demo Farm', true)
RETURNING farm_uuid;

-- Create a test user (use the UUID from above)
INSERT INTO profile (id, email, name, farm_uuid, role, is_active)
VALUES (
  auth.uid(),
  'demo@sproutify.app',
  'Demo User',
  'YOUR_FARM_UUID_HERE',
  'Owner',
  true
);

-- Add some varieties
INSERT INTO varieties (variety_name, description, farm_uuid, is_active)
VALUES
  ('Sunflower', 'Nutty and crunchy microgreen', 'YOUR_FARM_UUID_HERE', true),
  ('Pea Shoots', 'Sweet and tender', 'YOUR_FARM_UUID_HERE', true),
  ('Radish', 'Spicy and colorful', 'YOUR_FARM_UUID_HERE', true);
```

## Marketing Site Setup

### 1. Navigate and Install

```bash
cd marketing-site
npm install
```

### 2. Configure Environment

Create `.env` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173)

### 4. Test Features

- Navigate to homepage
- Click pricing toggle (monthly/annual)
- Test navigation to Terms, Privacy, Contact
- Click Login button (should show login page)
- Test Sage chatbot (floating button, lower right)

## Web Admin Setup

### 1. Navigate and Install

```bash
cd web-admin
npm install
```

### 2. Configure Environment

Create `.env` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:5174](http://localhost:5174)

### 4. Login

Use credentials from Supabase Auth or create account via Supabase Dashboard

### 5. Test Features

- View dashboard with stats
- Navigate through all menu items
- Test sidebar collapse
- Click "Add User" button
- Test Sage chatbot

## Mobile App Setup

### 1. Navigate and Install

```bash
cd mobile-app
npm install
```

### 2. Configure Environment

Create `.env` file:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Start Expo

```bash
npm start
```

### 4. Run on Device/Simulator

Choose one:
- Press `w` for web
- Press `i` for iOS simulator (macOS only)
- Press `a` for Android emulator
- Scan QR code with Expo Go app on physical device

### 5. Test Features

- Login with test credentials
- View home dashboard
- Navigate to Seeding, Harvest, Tasks, Profile tabs
- Test task completion
- Test variety selection

## n8n Integration Setup

### 1. Install n8n (if needed)

Self-hosted:
```bash
npm install n8n -g
n8n start
```

Or use n8n Cloud: [https://app.n8n.cloud](https://app.n8n.cloud)

### 2. Import Workflows

1. Open n8n dashboard
2. Click "Workflows" > "Import from File"
3. Import `n8n-workflows/sage-chat-workflow.json`
4. Import `n8n-workflows/label-generation-workflow.json`

### 3. Configure Sage Chat Workflow

1. Open "Sage Chat Assistant" workflow
2. Click on "OpenAI" node
3. Add OpenAI credentials:
   - API Key: Your OpenAI API key
4. Click "Webhook" node
5. Copy the webhook URL (e.g., `https://your-n8n.com/webhook/sage-chat`)
6. Update this URL in:
   - `marketing-site/src/components/SageChat.tsx`
   - `web-admin/src/components/SageChat.tsx`
7. Activate workflow

### 4. Configure Label Generation Workflow

1. Open "Generate Microgreen Labels" workflow
2. Configure Google Docs credentials (or alternative PDF generator)
3. Configure SMTP credentials for email sending
4. Click "Webhook" node
5. Copy webhook URL
6. Add to Supabase Edge Function environment variables
7. Activate workflow

### 5. Test n8n Integration

Test Sage Chat:
```bash
curl -X POST https://your-n8n.com/webhook/sage-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I grow sunflower microgreens?"}'
```

Should return AI response about sunflower microgreens.

## Testing

### Marketing Site

```bash
cd marketing-site

# Test build
npm run build

# Preview production build
npm run preview
```

### Web Admin

```bash
cd web-admin

# Test build
npm run build

# Preview production build
npm run preview
```

### Mobile App

```bash
cd mobile-app

# Run tests
npm test

# Build for web
npm run build:web
```

## Deployment

### Deploy Marketing Site (Vercel)

```bash
cd marketing-site

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Add environment variables in Vercel dashboard.

### Deploy Web Admin (Vercel)

```bash
cd web-admin
vercel --prod
```

Add environment variables in Vercel dashboard.

### Deploy Mobile App

#### Build for iOS (macOS required)

```bash
cd mobile-app

# Install EAS CLI
npm install -g eas-cli

# Configure
eas build:configure

# Build
eas build --platform ios
```

#### Build for Android

```bash
eas build --platform android
```

#### Submit to App Stores

```bash
# iOS
eas submit --platform ios

# Android
eas submit --platform android
```

## Post-Deployment Checklist

- [ ] Supabase project created and configured
- [ ] Database schema deployed
- [ ] Edge functions deployed
- [ ] Marketing site deployed and accessible
- [ ] Web admin deployed and accessible
- [ ] Mobile app built and tested
- [ ] n8n workflows imported and activated
- [ ] Sage chat tested and working
- [ ] Test user account created
- [ ] All environment variables configured
- [ ] DNS/domain configured (if applicable)
- [ ] SSL certificates configured
- [ ] Analytics setup (optional)

## Troubleshooting

### Supabase Connection Issues

- Verify URL and anon key are correct
- Check RLS policies are enabled
- Ensure user is authenticated

### n8n Webhook Not Responding

- Check workflow is activated
- Verify webhook URL is correct
- Check n8n logs for errors
- Test with curl command

### Mobile App Build Errors

- Clear node_modules and reinstall
- Update Expo SDK
- Check app.json configuration

### Sage Chat Not Working

- Verify n8n webhook URL
- Check OpenAI API key
- Test n8n workflow independently
- Check browser console for errors

## Support Resources

- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev)
- [React Native Documentation](https://reactnative.dev)
- [Expo Documentation](https://docs.expo.dev)
- [n8n Documentation](https://docs.n8n.io)

## Next Steps

After setup:

1. Customize branding and colors
2. Add custom varieties and recipes
3. Create farm-specific workflows
4. Set up production database backups
5. Configure monitoring and alerts
6. Train staff on using the system
7. Customize Sage AI with farm-specific knowledge

---

**Congratulations!** You've successfully set up Sproutify Micro. 🌱

For additional help, check the main README.md or contact support.
