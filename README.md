# Sproutify Micro

Complete microgreen farm management system with web, admin, and mobile applications.

## Overview

Sproutify Micro is a comprehensive farm management solution designed specifically for microgreen growers. It provides:

- **Marketing Website** - Public-facing site with pricing and information
- **Web Admin** - Full-featured admin dashboard for farm management
- **Mobile App** - Worker-focused mobile application for daily operations
- **Sage AI Assistant** - Intelligent chatbot powered by n8n and OpenAI

## Architecture

### Frontend Applications

1. **Marketing Site** (`/marketing-site`)
   - Built with React + Vite + TypeScript
   - Features: Hero section, pricing, product info, login
   - Port: 5173

2. **Web Admin** (`/web-admin`)
   - Built with React + Vite + TypeScript
   - Features: Dashboard, user management, tray tracking, recipes, orders
   - Port: 5174

3. **Mobile App** (`/mobile-app`)
   - Built with React Native + Expo
   - Features: Seeding, harvesting, task management, profile
   - Supports iOS, Android, and Web

### Backend Infrastructure

1. **Supabase** - PostgreSQL database, authentication, and serverless functions
   - Schema in `/supabase/migrations/001_initial_schema.sql`
   - Functions for tray creation, harvest recording, and label generation

2. **n8n Workflows** - Automation and AI integration
   - Sage chat assistant with OpenAI
   - Label generation and email delivery
   - Workflow definitions in `/n8n-workflows/`

## Color Scheme (Slate Blue)

```css
Primary: #5B7C99
Primary Dark: #4A6479
Primary Light: #7A99B4
Background: #F7F9FA
Text Primary: #2A3744
Success: #4CAF50
Error: #E57373
Warning: #FFB74D
Info: #64B5F6
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- n8n instance (optional, for Sage chat)
- Expo CLI (for mobile development)

### Environment Variables

Create `.env` files in each project:

#### Marketing Site & Web Admin

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### Mobile App

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### Supabase Functions

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
N8N_LABEL_WEBHOOK_URL=https://n8n.sproutify.app/webhook/generate-labels
```

### Installation

1. **Install Marketing Site**
   ```bash
   cd marketing-site
   npm install
   npm run dev
   ```

2. **Install Web Admin**
   ```bash
   cd web-admin
   npm install
   npm run dev
   ```

3. **Install Mobile App**
   ```bash
   cd mobile-app
   npm install
   npm start
   ```

4. **Deploy Supabase Schema**
   ```bash
   # Using Supabase CLI
   supabase db push
   ```

5. **Deploy Supabase Functions**
   ```bash
   supabase functions deploy create-tray
   supabase functions deploy record-harvest
   supabase functions deploy generate-labels
   ```

6. **Import n8n Workflows**
   - Import JSON files from `/n8n-workflows/` into your n8n instance
   - Configure credentials (OpenAI API key, SMTP settings, etc.)
   - Activate workflows

## Database Schema

### Core Tables

- `farms` - Farm information
- `profile` - User profiles with farm association
- `varieties` - Microgreen varieties catalog
- `recipes` - Growing recipes with steps
- `steps` - Individual recipe steps
- `trays` - Tray tracking from seed to harvest
- `customers` - Customer management
- `vendors` - Supplier management
- `seedbatches` - Seed inventory tracking
- `tray_steps` - Individual tray step completion

### Views

- `profile_with_farm` - User profiles joined with farm data
- `recipes_with_creator_name` - Recipes with creator information
- `daily_tasks_view` - Pending tasks by date

## Features

### Marketing Website
- Hero section with call-to-action
- Product features showcase
- Pricing tiers (Starter, Professional, Enterprise)
- Monthly/Annual toggle
- Login redirect to admin
- Legal pages (Terms, Privacy, Contact)

### Web Admin
- Dashboard with statistics
- User management with roles (Owner, Editor, Viewer)
- Microgreen variety catalog
- Recipe management with steps
- Batch tracking
- Tray lifecycle management
- Order processing
- Customer & vendor management
- Supply inventory
- Settings and configuration

### Mobile App
- Home dashboard with quick stats
- Seeding workflow
- Harvest recording
- Daily task checklist
- User profile and farm info
- Offline-capable design

### Sage AI Assistant
- Floating chat button (lower right)
- Context-aware responses about microgreens
- Platform guidance and troubleshooting
- Powered by OpenAI via n8n
- Available in all applications

## API Endpoints

### Supabase Functions

1. **Create Tray**
   - POST `/functions/v1/create-tray`
   - Creates tray and associated steps
   - Returns tray ID

2. **Record Harvest**
   - POST `/functions/v1/record-harvest`
   - Updates tray harvest data
   - Marks steps complete

3. **Generate Labels**
   - POST `/functions/v1/generate-labels`
   - Triggers n8n workflow
   - Sends labels via email

### n8n Webhooks

1. **Sage Chat**
   - POST `https://n8n.sproutify.app/webhook/sage-chat`
   - Body: `{ "message": "user question" }`
   - Returns: `{ "response": "AI response" }`

2. **Generate Labels**
   - POST `https://n8n.sproutify.app/webhook/generate-labels`
   - Body: `{ "trays": [...], "email": "..." }`
   - Sends PDF labels via email

## Security

- Row Level Security (RLS) enabled on all tables
- Farm-based data isolation
- Role-based access control (Owner, Editor, Viewer)
- JWT authentication via Supabase
- CORS protection on webhooks

## Development

### Running Tests

```bash
# Marketing site
cd marketing-site && npm test

# Web admin
cd web-admin && npm test

# Mobile app
cd mobile-app && npm test
```

### Building for Production

```bash
# Marketing site
cd marketing-site && npm run build

# Web admin
cd web-admin && npm run build

# Mobile app
cd mobile-app && npm run build:web
```

## Deployment

### Vercel (Web Apps)

```bash
# Deploy marketing site
vercel --prod ./marketing-site

# Deploy web admin
vercel --prod ./web-admin
```

### Expo (Mobile App)

```bash
cd mobile-app

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

### Supabase

```bash
# Deploy database migrations
supabase db push

# Deploy edge functions
supabase functions deploy
```

## Support

For issues or questions:
- Create an issue on GitHub
- Contact via the website contact form
- Email: support@sproutify.app

## License

Copyright © 2025 Sproutify Micro. All rights reserved.

## Version

1.0.0
