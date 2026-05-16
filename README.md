# LinkedIn Network Explorer

A fast, privacy-first dashboard for exploring your LinkedIn connections. Upload your `Connections.csv` and instantly visualise your network — no server, no account, no data leaving your browser.

**[Live demo →](https://your-username.github.io/linkedin-dashboard)**

![Dashboard preview](preview.png)

---

## Features

- **Network heatmap** — see when you've been most active, month by month across every year
- **Seniority breakdown** — understand whether your network skews toward peers, managers, or executives
- **Top companies** — ranked by how many connections you have there
- **Filterable connections table** — search by name, company, or title; click any name to open their LinkedIn profile
- **Google Jobs search** — pick a company from your network, type a role, and search live job listings in one click
- **100% client-side** — your data is never uploaded anywhere

---

## Getting your Connections.csv from LinkedIn

LinkedIn lets you export your own data at any time. Here's how:

### Step 1 — Request your data

1. Go to [linkedin.com](https://www.linkedin.com) and sign in
2. Click your profile picture in the top right → **Settings & Privacy**
3. In the left sidebar, click **Data Privacy**
4. Under *How LinkedIn uses your data*, click **Get a copy of your data**

### Step 2 — Choose what to download

You'll see two options:

- **"Want something in particular?"** — faster (ready in ~10 minutes), but limited
- **"Download larger data archive"** — full export, takes up to 24 hours

For the connections file, the faster option is enough. Select **Connections** from the list of checkboxes, then click **Request archive**.

### Step 3 — Wait for the email

LinkedIn will send you an email when your archive is ready. This usually takes between 10 minutes and a few hours depending on the option you chose.

### Step 4 — Download and unzip

1. Click the link in the email, or go back to **Settings → Data Privacy → Get a copy of your data** and click **Download archive**
2. Unzip the downloaded file
3. Inside you'll find `Connections.csv`

> **Note:** LinkedIn adds a few lines of notes at the top of the CSV before the actual data headers. This app handles that automatically — just upload the file as-is.

---

## Running locally

```bash
# Clone the repo
git clone https://github.com/your-username/linkedin-dashboard.git
cd linkedin-dashboard

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for production

```bash
npm run build
```

The output goes to the `dist/` folder. You can deploy it anywhere that serves static files — Vercel, Netlify, GitHub Pages, or an S3 bucket.

---

## Deploying to Vercel (recommended)

The easiest way to get this live with zero configuration:

1. Fork this repo on GitHub
2. Go to [vercel.com](https://vercel.com) and click **Add New Project**
3. Import your forked repo — Vercel detects Vite automatically
4. Click **Deploy**

Your app will be live at `https://your-project.vercel.app` in about 60 seconds. Every push to `main` triggers an automatic redeploy.

---

## Tech stack

| Layer | Tool |
|---|---|
| Framework | React 18 |
| Build | Vite |
| Charts | Recharts |
| CSV parsing | PapaParse |
| Styling | Inline styles + CSS variables |

No backend. No database. No tracking.

---

## Privacy

Your `Connections.csv` is parsed entirely in your browser using the [FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader). The data is held in React state for the duration of your session and discarded when you close the tab. Nothing is sent to any server.

---

## CSV format

This app expects LinkedIn's standard `Connections.csv` format with the following columns:

| Column | Description |
|---|---|
| `First Name` | Connection's first name |
| `Last Name` | Connection's last name |
| `URL` | Their LinkedIn profile URL |
| `Email Address` | Only populated if they've shared it with you |
| `Company` | Current company at time of export |
| `Position` | Current job title at time of export |
| `Connected On` | Date you connected |

> Company and position reflect the moment you exported — they won't update automatically as people change jobs.

---

## Contributing

Issues and pull requests are welcome. If you find a bug or have a feature idea, open an issue first so we can discuss it before you build.

---

## Licence

MIT — do whatever you like with it.
