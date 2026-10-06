# Molla Pro Zone AI

Premium multimodal AI web app created for **Manik Hossain Molla**.

## Included

- Premium responsive login / signup / OTP UI
- Supabase email verification + persistent sessions
- Email or username login
- 500 welcome credits
- Credit ledger and server-side enforcement
- Chat + image analysis
- Gemini image generation with aspect-ratio and resolution controls
- Veo video generation with background polling
- Text-to-speech Voice Studio
- Multi-file Project Builder with direct folder write (Chrome/Edge) and ZIP fallback
- Manual bKash recharge with TrxID + admin approval
- Admin dashboard for recharge approval and credit pricing
- Recharge packages:
  - 3,000 credits — ৳30
  - 5,000 credits — ৳50
  - 10,000 credits — ৳100
- Personal bKash payment flow: **Send Money**
- Generated image/video/audio download
- Friendly error handling and automatic credit refunds when an AI generation fails
- Branding: **Molla Pro Zone AI — Created by Manik Hossain Molla**

## 1. Create Supabase project

Create a free Supabase project.

Open **SQL Editor**, paste the entire contents of `supabase-schema.sql`, and run it.

### Make your account Admin

After you sign up once, run:

```sql
update public.profiles
set is_admin = true
where email = 'YOUR_ADMIN_EMAIL@example.com';
```

Sign out and sign back in. The Admin Panel will appear.

## 2. Configure the 6-digit signup code

In Supabase:

**Authentication → Email Templates → Confirm signup**

Use a template containing the token, for example:

```html
<h2>Your Molla Pro Zone AI verification code</h2>
<p>Enter this 6-digit code:</p>
<h1>{{ .Token }}</h1>
```

The frontend uses `verifyOtp(..., type: "signup")`.

For production email volume, connect a custom SMTP provider in Supabase Auth settings.

## 3. Netlify environment variables

In **Netlify → Site configuration → Environment variables**, add:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

Optional model overrides:

- `GEMINI_TEXT_MODEL=gemini-3.8-flash`
- `GEMINI_IMAGE_MODEL=gemini-nano-banana-2.1`
- `GEMINI_VIDEO_MODEL=veo-3.1-generate-preview`
- `GEMINI_TTS_MODEL=gemini-3.8-flash-tts`

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in browser code.

## 4. Deploy to Netlify

### Easy method

1. Extract this ZIP.
2. Push the folder to GitHub.
3. In Netlify, choose **Add new project → Import from Git**.
4. Select the repository.
5. Build command can be left empty.
6. Publish directory: `.`
7. Add the environment variables above.
8. Deploy.

### Netlify CLI

```bash
npm install
npx netlify dev
```

For production:

```bash
npx netlify deploy --prod
```

## 5. Gemini / Veo API access

The app uses configurable model names because API availability and account access can differ.

Your consumer Gemini subscription does **not** automatically guarantee API quota or Veo/TTS access. The API key must have access to each selected model.

If a model name changes, update only the Netlify environment variable—no frontend code change is needed.

## Credits

Defaults:

- Welcome bonus: **500**
- Chat: **1 credit / message**
- Image: **20 credits**
- Video: **50 credits**
- Voice: **10 credits**
- Project Builder: **20 credits**

All of these can be changed from Admin Panel except recharge packages, which are stored in `recharge_packages` and can be edited in Supabase.

### Recharge flow

User selects package → sends **Send Money** to the configured Personal bKash number → enters TrxID → request is Pending → Admin verifies in bKash app → Admin clicks Approve → credits are added atomically.

Duplicate TrxIDs are blocked by a unique database constraint.

## Important production notes

- The `user-media` bucket is public so generated downloads are simple. For stricter privacy, make it private and switch the functions to signed URLs.
- Add rate limiting / bot protection before opening the site to a large public audience.
- Review Google Gemini API pricing before setting credit prices. Video generation can be substantially more expensive than text.
- Netlify and Supabase free tiers have limits.
- File System Access works best on Chromium desktop browsers. ZIP fallback is provided elsewhere.
- The app never stores bKash PIN/OTP/password.
