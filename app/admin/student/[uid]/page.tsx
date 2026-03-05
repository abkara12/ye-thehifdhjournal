/* app/admin/student/[uid]/page.tsx */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../../lib/firebase";

/** -------------------- Date helpers -------------------- */
function getDateKeySA() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function diffDaysInclusive(startKey: string, endKey: string) {
  const a = parseDateKey(startKey);
  const b = parseDateKey(endKey);
  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(0, days) + 1;
}

function isoWeekKeyFromDateKey(dateKey: string) {
  const d = parseDateKey(dateKey);
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (date.getDay() + 6) % 7; // Mon=0..Sun=6
  date.setDate(date.getDate() - day + 3); // Thu of current week
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);

  const weekNo =
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

  const year = date.getFullYear();
  const ww = String(weekNo).padStart(2, "0");
  return `${year}-W${ww}`;
}

function toText(v: unknown) {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

// helper: prefer new field if present, else fallback
function pickText(primary: unknown, fallback: unknown) {
  const p = toText(primary).trim();
  if (p) return p;
  return toText(fallback);
}

/** -------------------- UI shell -------------------- */
function Shell({
  title,
  subtitle,
  rightSlot,
  children,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen text-gray-900">
     <div className="pointer-events-none fixed inset-0 -z-10">
  {/* Clean luxury base */}
  <div className="absolute inset-0 bg-[#F8F6F1]" />

  {/* Deep contrast blobs */}
  <div className="absolute -top-72 -right-40 h-[900px] w-[900px] rounded-full bg-[#1F3F3F]/25 blur-3xl" />
  <div className="absolute bottom-[-25%] left-[-15%] h-[1000px] w-[1000px] rounded-full bg-[#B8963D]/20 blur-3xl" />

  {/* Subtle radial glow */}
  <div className="absolute inset-0 bg-[radial-gradient(1000px_circle_at_70%_20%,rgba(184,150,61,0.15),transparent_60%)]" />

  {/* Elegant vignette */}
  <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_50%_10%,transparent_50%,rgba(0,0,0,0.08))]" />

  {/* Noise */}
  <div className="absolute inset-0 opacity-[0.035] mix-blend-multiply bg-[url('/noise.png')]" />
</div>

      <div className="max-w-5xl mx-auto px-5 sm:px-10 py-8 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className="uppercase tracking-widest text-xs text-[#B8963D]">
              Admin → Student
            </p>
            <h1 className="mt-2 text-2xl sm:text-4xl font-semibold tracking-tight break-words">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-gray-700 leading-relaxed max-w-2xl">
                {subtitle}
              </p>
            ) : null}
          </div>

          {rightSlot ? <div className="w-full sm:w-auto">{rightSlot}</div> : null}
        </div>

        <div className="mt-7 sm:mt-8">{children}</div>
      </div>
    </main>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-3xl border border-gray-300 bg-white/70 backdrop-blur-xl backdrop-blur p-6 sm:p-7 shadow-sm">
      <div className="h-5 w-40 bg-black/10 rounded-full animate-pulse" />
      <div className="mt-3 h-10 w-2/3 bg-black/10 rounded-2xl animate-pulse" />
      <div className="mt-6 grid gap-3">
        <div className="h-12 bg-black/10 rounded-2xl animate-pulse" />
        <div className="h-12 bg-black/10 rounded-2xl animate-pulse" />
        <div className="h-12 bg-black/10 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}


/** -------------------- Page -------------------- */
export default function AdminStudentPage() {
  const params = useParams<{ uid: string }>();
  const studentUid = params.uid;

  const [me, setMe] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

const [studentName, setStudentName] = useState("");
  
  // daily fields
  const [sabak, setSabak] = useState("");
  const [sabakDhor, setSabakDhor] = useState("");
  const [dhor, setDhor] = useState("");
  const [hoursForDay, setHoursForDay] = useState("");

  // ✅ reading quality fields
  // IMPORTANT: Student overview expects sabakRead / sabakDhorRead / dhorRead
  // We keep quality state names, but we will SAVE to BOTH field-name styles.
  const [sabakReadNotes, setSabakReadNotes] = useState("");

  const [sabakDhorReadNotes, setSabakDhorReadNotes] = useState("");

  const [dhorReadNotes, setDhorReadNotes] = useState("");

  const [weeklyLinesLearned, setWeeklyLinesLearned] = useState("");

  const [sabakDhorHalf, setSabakDhorHalf] = useState("first");
  const [dhorHalf, setDhorHalf] = useState("first");

 

 
  // UI
  const [markGoalCompleted, setMarkGoalCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dateKey = useMemo(() => getDateKeySA(), []);
  const currentWeekKey = useMemo(() => isoWeekKeyFromDateKey(dateKey), [dateKey]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setMe(u);

      if (!u) {
        setIsAdmin(false);
        setChecking(false);
        return;
      }

      try {
        const myDoc = await getDoc(doc(db, "users", u.uid));
        const role = myDoc.exists() ? (myDoc.data() as any).role : null;
        setIsAdmin(role === "admin");
      } finally {
        setChecking(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    async function loadStudent() {
      const sDoc = await getDoc(doc(db, "users", studentUid));
      if (sDoc.exists()) {
        const data = sDoc.data() as any;

setStudentName(
  toText(data.username) || toText(data.email) || "Student"
);
      
        // seed with snapshot
        setSabak(toText(data.currentSabak));
        setSabakDhor(toText(data.currentSabakDhor));
        setDhor(toText(data.currentDhor));
     

        // ✅ seed reading snapshot
        // read from either naming style
        
        setSabakDhorReadNotes(toText(data.currentSabakDhorReadNotes));
      }

      // today's log overrides if exists
      const todayDoc = await getDoc(doc(db, "users", studentUid, "logs", dateKey));
      if (todayDoc.exists()) {
        const d = todayDoc.data() as any;
        setSabak(toText(d.sabak));
        setSabakDhor(toText(d.sabakDhor));
        setDhor(toText(d.dhor));
      

        // ✅ reading fields from today log (read from either naming style)
      }
    }

    if (studentUid) loadStudent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUid, dateKey]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    setMsg(null);

    try {
      // ---- Weekly goal meta updates ----
    
     
      // ---- 1) Daily log doc ----
      await setDoc(
        doc(db, "users", studentUid, "logs", dateKey),
        {
          dateKey,
          createdAt: serverTimestamp(),

          sabak,
          sabakDhor,
          dhor,

          // ✅ Save the EXACT field names the student table expects
        
          // ✅ Keep your existing "Quality" keys too (backwards/for future

          // notes
          sabakReadNotes,
          sabakDhorReadNotes,
          dhorReadNotes,

          hoursForDay: hoursForDay || "",

           currentSabakDhorHalf: sabakDhorHalf,
           currentDhorHalf: dhorHalf,

          updatedBy: me?.uid ?? null,
          updatedByEmail: me?.email ?? null,
        },
        { merge: true }
      );

      // ---- 2) User snapshot doc ----
      await setDoc(
        doc(db, "users", studentUid),
        {
        

          currentSabak: sabak,
          currentSabakDhor: sabakDhor,
          currentDhor: dhor,

          // ✅ Save snapshot in BOTH naming styles too

          currentSabakReadNotes: sabakReadNotes,
          currentSabakDhorReadNotes: sabakDhorReadNotes,
          currentDhorReadNotes: dhorReadNotes,

          updatedAt: serverTimestamp(),
          lastUpdatedBy: me?.uid ?? null,
        },
        { merge: true }
      );

      // update local state so UI reflects instantly


      setMsg("Saved ✅");
      setTimeout(() => setMsg(null), 2500);
    } catch (err: any) {
      setMsg(err?.message ? `Error: ${err.message}` : "Error saving.");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <Shell title="Loading…" subtitle="Opening student page…">
        <LoadingCard />
      </Shell>
    );
  }

  if (!me) {
    return (
      <Shell title="Please sign in" subtitle="You must be signed in to log work for a student.">
        <div className="rounded-3xl border border-gray-300 bg-white/70 backdrop-blur p-6 sm:p-7 shadow-sm">
          <p className="text-gray-700">Go to login, then return to the admin dashboard.</p>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-900"
            >
              Go to login
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center justify-center h-11 px-6 rounded-full border border-gray-300 bg-white/70 hover:bg-white text-sm font-semibold"
            >
              Back to Admin
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (!isAdmin) {
    return (
      <Shell title="Access denied" subtitle="This account is not marked as admin.">
        <div className="rounded-3xl border border-gray-300 bg-white/70 backdrop-blur p-6 sm:p-7 shadow-sm">
          <div className="text-sm text-gray-600">Signed in as</div>
          <div className="mt-1 font-semibold">{me.email}</div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title={`Log work for ${studentName || "student"}`}
      subtitle={`Submitting for ${dateKey} • ${currentWeekKey}`}
      rightSlot={
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Link
            href="/admin"
            className="inline-flex w-full sm:w-auto items-center justify-center h-11 px-5 rounded-full border border-gray-300 bg-white/70 hover:bg-white transition-colors text-sm font-semibold"
          >
            Back
          </Link>
          <Link
            href={`/admin/student/${studentUid}/overview`}
            className="inline-flex w-full sm:w-auto items-center justify-center h-11 px-5 rounded-full bg-[#111111] text-white hover:bg-[#1c1c1c] shadow-lg shadow-black/10 transition-colors text-sm font-semibold shadow-sm"
          >
            Student Overview
          </Link>
        </div>
      }
    >
      <div className="rounded-3xl border border-gray-300 bg-white/70 backdrop-blur p-5 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white/70 px-4 py-2 text-xs font-semibold text-gray-700 w-fit">
            <span className="h-2 w-2 rounded-full bg-[#B8963D]" />
            Update today’s work
          </div>

        </div>

        <form onSubmit={handleSave} className="mt-6 grid gap-5">
          {/* Sabak */}
          <div className="rounded-3xl border border-gray-300 bg-white/70 backdrop-blur-xl p-5 sm:p-6">
            <div className="text-sm font-semibold text-gray-900">Sabak</div>
            <div className="mt-4 grid gap-4">
              <Field
                label="Sabak Lines(Today)"
                value={sabak}
                setValue={setSabak}
                hint="Example: 2 pages / 1 ruku / 5 lines"
              />

              <div className="grid sm:grid-cols-2 gap-4">
                
                <Field
                  label="Sabak reading notes (optional)"
                  value={sabakReadNotes}
                  setValue={setSabakReadNotes}
                  hint="Short notes: fluency, tajweed, stops, etc."
                />
              </div>
            </div>
          </div>

          {/* Sabak Dhor */}
          <div className="rounded-3xl border border-gray-300 bg-white/70 backdrop-blur-xl p-5 sm:p-6">
            <div className="text-sm font-semibold text-gray-900">Sabak Dhor</div>
            <div className="mt-4 grid gap-4">
              <Field
                label="Sabak Dhor(1/2 Juz)"
                value={sabakDhor}
                setValue={setSabakDhor}
                hint="Revision for current sabak"
              />
              <SelectField
  label="Which half did you read?"
  value={sabakDhorHalf}
  setValue={setSabakDhorHalf}
  options={[
    { value: "first", label: "First Half" },
    { value: "second", label: "Second Half" },
  ]}
/>

              <div className="grid sm:grid-cols-2 gap-4">
              
                <Field
                  label="Sabak Dhor reading notes (optional)"
                  value={sabakDhorReadNotes}
                  setValue={setSabakDhorReadNotes}
                  hint="Short notes"
                />
              </div>

            </div>
          </div>

          {/* Dhor */}
          <div className="rounded-3xl border border-gray-300 bg-white/70 backdrop-blur-xl p-5 sm:p-6">
            <div className="text-sm font-semibold text-gray-900">Dhor</div>
            <div className="mt-4 grid gap-4">
              <Field
                label="Dhor(1/2 Juz)"
                value={dhor}
                setValue={setDhor}
                hint="Older revision"
              />


              <SelectField
  label="Which half did you read?"
  value={dhorHalf}
  setValue={setDhorHalf}
  options={[
    { value: "first", label: "First Half" },
    { value: "second", label: "Second Half" },
  ]}
/>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="Dhor reading notes (optional)"
                  value={dhorReadNotes}
                  setValue={setDhorReadNotes}
                  hint="Short notes"
                />
              </div>

          
            </div>
            
          </div>


   {/* Dhor */}
          <div className="rounded-3xl border border-gray-300 bg-white/70 backdrop-blur-xl p-5 sm:p-6">
            <div className="text-sm font-semibold text-gray-900">Hours</div>
            <div className="mt-4 grid gap-4">
              <Field
              label="Hours Spent Learning (Today)"
              value={hoursForDay}
              setValue={setHoursForDay}
              hint="Example: 2.5 hours"
/>
            </div>
            
          </div>


          <div className="rounded-3xl border border-gray-300 bg-white/70 backdrop-blur-xl p-5 sm:p-6 mt-6">
  <div className="text-sm font-semibold text-gray-900">Weekly Lines Learned</div>
  <div className="mt-4 grid gap-4">
    <Field
      label="Total Lines Learned This Week"
      value={weeklyLinesLearned}
      setValue={setWeeklyLinesLearned}
      hint="Enter the total lines learned for this week"
    />
  </div>
</div>

            
          
          


          <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              disabled={saving}
              className="h-12 w-full sm:w-auto px-7 rounded-2xl bg-black text-white font-semibold hover:bg-gray-900 disabled:opacity-60 shadow-sm"
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <div
              className={`text-sm font-medium ${
                msg?.startsWith("Error") ? "text-red-600" : "text-gray-700"
              }`}
            >
              {msg ?? ""}
            </div>
          </div>
        </form>
      </div>
    </Shell>
  );
}

function Field({
  label,
  hint,
  value,
  setValue,
}: {
  label: string;
  hint: string;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-end justify-between gap-4">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <span className="text-xs text-gray-500">{hint}</span>
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 rounded-2xl border border-gray-300 bg-white/80 px-4 outline-none focus:ring-2 focus:ring-[#B8963D]/30"
        placeholder="Type here…"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  setValue,
  options,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-end justify-between gap-4">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <span className="text-xs text-gray-500">Select</span>
      </div>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 rounded-2xl border border-gray-300 bg-white/80 px-4 outline-none focus:ring-2 focus:ring-[#B8963D]/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-300 bg-white/70 px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900 break-words">{value}</div>
    </div>
  );
}
