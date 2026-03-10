# GitHub Repository Setup Instructions

## Step 1: Create Repository on GitHub

1. Go to https://github.com/new
2. **Repository name**: `fast-prime-search`
3. **Description**: High-performance prime number search using multithreading in TypeScript
4. **Visibility**: Public
5. **Initialize repository with**: 
   - [x] Add a README (we'll overwrite it)
   - [x] Add .gitignore (select "Node")
   - [x] Choose a license (select "MIT")
6. Click "Create repository"

## Step 2: Configure Repository Settings

1. Go to Settings → General
2. **Social Preview**: Upload a custom image (optional)
3. **Topics**: Add these tags:
   - `prime-numbers`
   - `multithreading`
   - `performance`
   - `typescript`
   - `nodejs`
   - `worker-threads`
   - `math`
   - `algorithm`

## Step 3: Add NPM Token for Publishing

1. Go to Settings → Secrets → Actions
2. Click "New repository secret"
3. **Name**: `NPM_TOKEN`
4. **Value**: Your NPM access token (get it from https://www.npmjs.com/settings/tokens)
5. Click "Add secret"

## Step 4: Push Local Code

In your terminal, run:

```bash
# Add the GitHub remote
git remote add origin https://github.com/vettis/fast-prime-search.git

# Rename master branch to main (GitHub standard)
git branch -M main

# Push to GitHub
git push -u origin main
```

## Step 5: Enable GitHub Actions

1. Go to Actions tab
2. If prompted, click "I understand my workflows, go ahead and enable them"

## Step 6: Branch Protection (Optional but Recommended)

1. Go to Settings → Branches
2. Click "Add rule" for `main` branch
3. Enable:
   - [x] Require pull request reviews before merging
   - [x] Require status checks to pass before merging
   - [x] Require conversation resolution before merging
4. Save changes

## Step 7: Verify CI/CD

1. Push any change to trigger CI:
   ```bash
   echo "# fast-prime-search" >> README.md
   git add README.md
   git commit -m "docs: update README"
   git push
   ```

2. Go to Actions tab and verify the CI workflow runs successfully

## Step 8: Publish to NPM

Once CI is working:

1. Create a new release on GitHub:
   - Go to Releases → "Create a new release"
   - Tag: `v1.0.0`
   - Title: "Initial release v1.0.0"
   - Description: Copy from CHANGELOG.md
   - Click "Publish release"

2. This will automatically trigger the publish workflow and push to NPM!

## Verification Checklist

- [ ] Repository created on GitHub
- [ ] Code pushed to main branch
- [ ] CI workflow runs successfully
- [ ] NPM_TOKEN secret added
- [ ] Topics/tags added
- [ ] Release created (triggers NPM publish)
- [ ] Package appears on https://www.npmjs.com/package/fast-prime-search

## Local Development Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Benchmark
npm run benchmark

# Run CLI
npx fast-prime-search 1 1000000 16
```

## Author Info

- **Name**: Ville Vettenranta
- **GitHub**: @vettis
- **NPM**: vettis
- **Email**: Add your email here (optional)

## License

MIT License - See LICENSE file for details

---

**Note**: The code is ready to publish! All benchmarks, tests, and documentation are complete.