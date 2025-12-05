# IONOS Deployment Plan for Sproutify Micro

## Overview
This plan covers deploying both the **Marketing Site** and **Web Admin** applications to IONOS using GitHub Actions.

## Prerequisites Checklist

### 1. IONOS Setup
- [ ] IONOS hosting account with Plesk access
- [ ] Two subdomains/domains configured in Plesk:
  - Marketing Site: `[marketing-domain].sproutify.app` (e.g., `sproutify.app` or `www.sproutify.app`)
  - Web Admin: `[admin-domain].sproutify.app` (e.g., `admin.sproutify.app` or `micro.sproutify.app`)
- [ ] SSH/SFTP access credentials for IONOS
- [ ] Document root paths identified in Plesk for both domains

### 2. GitHub Repository Setup
- [ ] Repository: `https://github.com/boilermanc/sproutify-micro`
- [ ] Access to repository settings
- [ ] Ability to create GitHub Actions workflows

## Required GitHub Secrets

You need to add these secrets in **GitHub → Settings → Secrets and variables → Actions**:

### Shared Secrets (used by both workflows)
1. **`VITE_SUPABASE_URL`**
   - Your Supabase project URL
   - Example: `https://xxxxxxxxxxxxx.supabase.co`
   - Used by: Both marketing-site and web-admin

2. **`VITE_SUPABASE_ANON_KEY`**
   - Your Supabase anonymous/publishable key
   - Found in: Supabase Dashboard → Settings → API
   - Used by: Both marketing-site and web-admin

3. **`IONOS_HOST`**
   - Your IONOS server hostname or IP address
   - Example: `s123456789.online-server.cloud` or `123.456.789.0`
   - Used by: Both workflows for SSH/SFTP

4. **`IONOS_USERNAME`**
   - Your IONOS SSH/SFTP username
   - Used by: Both workflows for SSH/SFTP

5. **`IONOS_PASSWORD`**
   - Your IONOS SSH/SFTP password
   - Used by: Both workflows for SSH/SFTP

### Total Secrets Needed: 5

**Note:** Both applications share the same Supabase credentials and IONOS server credentials, so you only need to set each secret once.

## Deployment Structure

### Marketing Site
- **Source Directory:** `/marketing-site`
- **Build Command:** `npm run build` (runs from `marketing-site/` directory)
- **Build Output:** `marketing-site/dist/`
- **Target Domain:** `[marketing-domain].sproutify.app` (you'll specify)
- **Target Path:** `/var/www/vhosts/sweetwaterurbanfarms.com/[marketing-domain]/httpdocs` (or similar)

### Web Admin
- **Source Directory:** `/web-admin`
- **Build Command:** `npm run build` (runs from `web-admin/` directory)
- **Build Output:** `web-admin/dist/`
- **Target Domain:** `[admin-domain].sproutify.app` (you'll specify)
- **Target Path:** `/var/www/vhosts/sweetwaterurbanfarms.com/[admin-domain]/httpdocs` (or similar)

## Implementation Steps

### Step 1: Create GitHub Actions Workflows
- Create `.github/workflows/deploy-marketing-site.yml`
- Create `.github/workflows/deploy-web-admin.yml`
- Each workflow will:
  - Build the respective app
  - Deploy to its specific domain path
  - Verify deployment

### Step 2: Create .htaccess Files
- Create `marketing-site/public/.htaccess`
- Create `web-admin/public/.htaccess`
- Both will contain Apache configuration for MIME types and routing

### Step 3: Configure Plesk Nginx Settings
- Configure Nginx for marketing site domain
- Configure Nginx for web admin domain
- Each needs proper MIME type handling for JavaScript modules

## Questions to Answer Before Implementation

1. **What are the exact domain names?**
   - Marketing Site: `?` (e.g., `sproutify.app`, `www.sproutify.app`)
   - Web Admin: `?` (e.g., `admin.sproutify.app`, `micro.sproutify.app`)

2. **What are the exact document root paths in Plesk?**
   - Marketing Site path: `?`
   - Web Admin path: `?`
   - (The workflows will auto-detect, but knowing helps)

3. **Do you already have the Supabase credentials?**
   - If yes, you can add them to GitHub secrets now
   - If no, get them from Supabase Dashboard → Settings → API

4. **Do you have IONOS SSH/SFTP credentials?**
   - Host, username, and password needed

## Next Steps After Setup

1. Add all 5 GitHub secrets
2. Confirm domain names and paths
3. I'll create the workflows and .htaccess files
4. Test deployment with manual workflow dispatch
5. Configure Nginx in Plesk for both domains
6. Verify both sites work correctly

## Environment Variables Reference

### Marketing Site
- `VITE_SUPABASE_URL` - From GitHub secrets
- `VITE_SUPABASE_ANON_KEY` - From GitHub secrets

### Web Admin
- `VITE_SUPABASE_URL` - From GitHub secrets
- `VITE_SUPABASE_ANON_KEY` - From GitHub secrets

Both apps use the same environment variable names, so they can share the same GitHub secrets.









