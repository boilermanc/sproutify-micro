# IONOS Deployment Instructions for micro.sproutify.app

## Overview
Both the Marketing Site and Web Admin are deployed to the same domain:
- **Marketing Site**: `micro.sproutify.app/` (root)
- **Web Admin**: `micro.sproutify.app/admin/` (subdirectory)

## What's Been Configured

### 1. GitHub Actions Workflows
- ✅ `.github/workflows/deploy-marketing-site.yml` - Deploys marketing site to root
- ✅ `.github/workflows/deploy-web-admin.yml` - Deploys admin to `/admin` subdirectory

### 2. Vite Configuration
- ✅ `web-admin/vite.config.ts` - Configured with `base: '/admin/'` for proper asset paths

### 3. React Router
- ✅ `web-admin/src/App.tsx` - Router configured with `basename="/admin"`

### 4. Login Redirect
- ✅ `marketing-site/src/pages/LoginPage.tsx` - Redirects to `/admin/` in production

### 5. .htaccess Files
- ✅ `marketing-site/public/.htaccess` - SPA routing and MIME types
- ✅ `web-admin/public/.htaccess` - SPA routing and MIME types

## GitHub Secrets Required

All secrets should already be set in GitHub → Settings → Secrets and variables → Actions:

1. `VITE_SUPABASE_URL`
2. `VITE_SUPABASE_ANON_KEY`
3. `IONOS_HOST`
4. `IONOS_USERNAME`
5. `IONOS_PASSWORD`

## Deployment Process

### First Deployment

1. **Deploy Marketing Site First** (to root):
   - Go to GitHub Actions
   - Run "Deploy Marketing Site to IONOS" workflow manually
   - This deploys to: `/var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs/`

2. **Deploy Web Admin** (to /admin subdirectory):
   - Go to GitHub Actions
   - Run "Deploy Web Admin to IONOS" workflow manually
   - This deploys to: `/var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs/admin/`

### Automatic Deployments

After the first deployment, both workflows will automatically trigger on:
- Push to `main` branch
- Changes to respective app directories (`marketing-site/**` or `web-admin/**`)

## Plesk Nginx Configuration

You need to configure Nginx in Plesk for `micro.sproutify.app`:

1. Log into Plesk
2. Go to **Domains** → **micro.sproutify.app**
3. Click **Apache & nginx Settings**
4. Scroll to **"Additional directives for nginx"**
5. Paste this configuration (also available in `NGINX_CONFIG_micro.sproutify.app.txt`):

```nginx
# CRITICAL: Serve assets directory first (before SPA routing)
# Marketing site assets (root)
location /assets/ {
	root /var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs;
	add_header Content-Type "application/javascript" always;
	try_files $uri =404;
}

# Admin assets (subdirectory)
location /admin/assets/ {
	root /var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs;
	add_header Content-Type "application/javascript" always;
	try_files $uri =404;
}

# Force correct MIME types for JS and CSS files
location ~* \.(js|mjs)$ {
	root /var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs;
	add_header Content-Type "application/javascript" always;
	try_files $uri =404;
}

location ~* \.css$ {
	root /var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs;
	add_header Content-Type "text/css" always;
	try_files $uri =404;
}

location ~* \.svg$ {
	root /var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs;
	add_header Content-Type "image/svg+xml" always;
	try_files $uri =404;
}

# Admin SPA routing - serve admin/index.html for /admin routes
location /admin {
	root /var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs;
	try_files $uri $uri/ /admin/index.html;
}

# Optional: Cache control for index.html files
location = /index.html {
	root /var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs;
	add_header Cache-Control "no-cache, no-store, must-revalidate" always;
	add_header Pragma "no-cache" always;
	add_header Expires 0 always;
}

location = /admin/index.html {
	root /var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs;
	add_header Cache-Control "no-cache, no-store, must-revalidate" always;
	add_header Pragma "no-cache" always;
	add_header Expires 0 always;
}
```

**⚠️ IMPORTANT:** 
- **Verify the path**: Check in Plesk → Domains → micro.sproutify.app → Hosting Settings to confirm the Document Root path
- If your path is different (e.g., `/var/www/vhosts/micro.sproutify.app/httpdocs` for standalone domain), update all `root` directives accordingly
- Do NOT include a `location /` block - Plesk already generates one automatically
- If you add a `location /` block, you'll get a "duplicate location" error

6. Click **OK** to save
7. Wait 1-2 minutes for changes to apply

## Verification Steps

After deployment:

1. **Check Marketing Site**:
   - Visit `https://micro.sproutify.app`
   - Should show the marketing homepage
   - Click "Login" - should redirect to `/admin/` after login

2. **Check Web Admin**:
   - Visit `https://micro.sproutify.app/admin/`
   - Should show the admin login page
   - Login should work correctly

3. **Check Browser Console**:
   - Open DevTools (F12)
   - Check for any 404 errors or MIME type errors
   - Assets should load with correct MIME types

## Troubleshooting

### Issue: 404 for /admin routes
**Solution:** Check Nginx configuration includes the `/admin` location block with `try_files` directive.

### Issue: Assets not loading in /admin
**Solution:** 
- Verify `/admin/assets/` location block in Nginx
- Check that web-admin was built with `base: '/admin/'` in vite.config.ts
- Verify files exist in `/httpdocs/admin/assets/`

### Issue: Marketing site shows admin content
**Solution:** 
- Verify marketing site workflow deployed to root, not `/admin`
- Check that marketing site index.html is in root, not `/admin/`

### Issue: Login redirects to localhost
**Solution:** 
- Verify LoginPage.tsx has been updated to use `/admin/` in production
- Check browser console for errors

## File Structure After Deployment

```
/var/www/vhosts/sweetwaterurbanfarms.com/micro.sproutify.app/httpdocs/
├── index.html          (marketing site)
├── assets/             (marketing site assets)
├── .htaccess          (marketing site)
└── admin/
    ├── index.html      (web admin)
    ├── assets/         (web admin assets)
    └── .htaccess       (web admin)
```

## Notes

- Both apps share the same Supabase credentials
- Both apps are on the same domain for easier authentication
- The marketing site login redirects to `/admin/` after successful authentication
- Each workflow only touches its specific directory to prevent conflicts

