# Zest Biologic Decision Support System

## To Commit Changes from Codespace

git add "path"
git commit -m "Whatever you want here for posterity"
git push


## 🚀 Opening a New Codespace (First Time Setup)

Copy and paste this entire block into your terminal:

```bash
sudo apt-get update && \
sudo apt-get install -y postgresql-16 postgresql-16-pgvector && \
sudo service postgresql start && \
sleep 2 && \
sudo -i -u postgres psql -c "ALTER USER postgres PASSWORD 'password';" && \
sudo -i -u postgres psql -c "CREATE DATABASE zest_biologic_dss;" && \
npm install && \
npx prisma db push && \
npm run dev
```

**That's it.** Your app will be running on http://localhost:3000

---

## 🔄 Pulling Changes from Claude

When Claude pushes changes and you need to update your codespace:

```bash
git pull && \
npm install && \
npx prisma db push && \
npm run dev
```

---

## 🛠️ When You Get Database Errors

If you see "Can't reach database server" or any database errors:

```bash
sudo service postgresql start && \
sleep 2 && \
npm run dev
```

---

## 📝 Setting Your OpenAI API Key (One Time Only)

The API key is in `/workspaces/Zest/.env` but you need to add it manually since GitHub blocks committing API keys.

Open the file and replace the empty quotes with your key:

```bash
OPENAI_API_KEY="your-key-here"
```

Or run this command with your actual key:

```bash
echo 'OPENAI_API_KEY="sk-your-actual-key-here"' >> /workspaces/Zest/.env
```

Then restart the dev server (Ctrl+C, then `npm run dev`).

---

## 🆘 Nuclear Option (If Everything is Broken)

If nothing works, run this to completely reset:

```bash
sudo service postgresql restart && \
sleep 2 && \
sudo -i -u postgres psql -c "DROP DATABASE IF EXISTS zest_biologic_dss;" && \
sudo -i -u postgres psql -c "CREATE DATABASE zest_biologic_dss;" && \
git pull && \
npm install && \
npx prisma db push && \
fuser -k 3000/tcp 3001/tcp 3002/tcp 2>/dev/null ; npm run dev
```

---

**That's everything you need. Just copy-paste these commands and you're good to go.**
