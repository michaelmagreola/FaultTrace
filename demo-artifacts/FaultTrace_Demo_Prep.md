# FaultTrace demo video — prep checklist

Target: **4:00**. Teleprompter: open `FaultTrace_Demo_Teleprompter.html` on a second screen.

## 1. Start the stack (two terminals)

**Terminal A — API**

```powershell
cd C:\Users\micha\FaultTrace\backend
.\.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

If search looks empty:

```powershell
python -m app.seed
```

**Terminal B — UI**

```powershell
cd C:\Users\micha\FaultTrace\frontend
npm run dev
```

Open: http://127.0.0.1:5173 · zoom **110%** · maximize window

## 2. Paste kit

| Role | Email | Password |
|------|-------|----------|
| Technician | `tech@cardinal.local` | `ADMIN` |
| Supervisor | `planner@cardinal.local` | `ADMIN` |
| Admin | `admin@cardinal.local` | `ADMIN` |

Search pastes: `spndl drift` · `axis wander` · `zzzzqwerty999`

Close-out sample: symptom matching what you will re-search; minutes `45`

## 3. Graded beats (never cut)

1. Refusal (`zzzzqwerty999`)
2. Citations on a good search
3. Keyboard: skip link + focus rings on login
4. Keyboard: chart Arrow keys (Daily/Weekly/Monthly)
5. Stop API → error message → restart → recover

## 4. Cut order if over 4:00

1. Optional 401 on `/docs`
2. Copy meeting brief
3. Second search `axis wander`
4. Re-embed

## 5. Record

1. 20s mic test
2. Open teleprompter → **Start timer**
3. Record browser (OBS / Clipchamp / Xbox Game Bar)
4. Read **SAY** lines; do **DO** lines; move on

## 6. After

Check: face/mic not clipping · clock optional · no long silent loads · tables readable
