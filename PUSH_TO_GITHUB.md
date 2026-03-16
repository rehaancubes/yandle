# Push to a new public GitHub repo

Your code is committed and **no secrets are included**:
- `.env` / `.env.local` are gitignored
- Firebase config uses placeholders in `voxa_mobile/lib/firebase_options.dart`
- `google-services.json` and `GoogleService-Info.plist` are gitignored (add your own for builds)

## Steps

1. **Create a new repo on GitHub**
   - Go to https://github.com/new
   - Repository name: e.g. `yandle` or `voxa`
   - Visibility: **Public**
   - Do **not** add a README, .gitignore, or license (you already have content)

2. **Add the remote and push** (replace `YOUR_USERNAME` and `YOUR_REPO` with your values):

   ```bash
   cd /Users/rehaanr/Documents/voxa
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git branch -M main
   git push -u origin main
   ```

   If you use SSH:
   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

3. **Optional – install GitHub CLI** for future “create repo and push” in one go:
   ```bash
   brew install gh
   gh auth login
   gh repo create YOUR_REPO --public --source=. --remote=origin --push
   ```
