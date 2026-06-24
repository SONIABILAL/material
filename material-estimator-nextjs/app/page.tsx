"use client";

import { useMemo, useState } from "react";

const defaults = {
  bricksPerCubicFoot: 14.16,
  brickWastagePercent: 5,
  mortarWetVolumePerCubicFootMasonry: 0.3,
  mortarDryVolumeFactor: 1.33,
  mortarSandParts: 6,
  cementBagVolumeCubicFeet: 1.226,
  plasterThicknessInches: 0.5,
  plasterDryVolumeFactor: 1.33,
  plasterSandParts: 4,
  plasterWastagePercent: 7.5,
  flooringWastagePercent: 7.5,
};

const stages = [
  "Reading full drawing package",
  "Extracting outside dimension chains",
  "Reading rooms, walls, heights, doors and windows",
  "Building unique wall registers floor by floor",
  "Running independent wall validation",
  "Calculating confirmed quantities",
  "Generating Excel and audit package",
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stageIndex, setStageIndex] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [values, setValues] = useState(defaults);

  const fileLabel = useMemo(() => {
    if (!file) return "No drawing selected";
    return `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  }, [file]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Select a PDF drawing first.");
      return;
    }
    setBusy(true);
    setError("");
    setStageIndex(0);

    const timer = window.setInterval(() => {
      setStageIndex((current) => Math.min(current + 1, stages.length - 1));
    }, 18000);

    try {
      const form = new FormData();
      form.append("pdf", file);
      Object.entries(values).forEach(([key, value]) => form.append(key, String(value)));

      const response = await fetch("/api/estimate", { method: "POST", body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `Request failed with ${response.status}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "material-estimate-package.zip";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStageIndex(stages.length - 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Estimate generation failed.");
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">DRAWING TAKE-OFF ENGINE</p>
        <h1>Material estimate from construction drawings</h1>
        <p className="lede">
          The tool reads each plan in stages, traces outside dimension chains, rejects false walls,
          and calculates only quantities supported by printed drawing evidence.
        </p>
      </section>

      <form className="panel" onSubmit={submit}>
        <label className="dropzone">
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span className="drop-title">Upload architectural or structural PDF</span>
          <span className="drop-copy">Dense submission sheets are supported. Keep each file below 45 MB.</span>
          <strong>{fileLabel}</strong>
        </label>

        <button
          className="link-button"
          type="button"
          onClick={() => setAdvanced((current) => !current)}
          disabled={busy}
        >
          {advanced ? "Hide" : "Edit"} material coefficients
        </button>

        {advanced && (
          <div className="grid">
            {Object.entries(values).map(([key, value]) => (
              <label key={key}>
                <span>{key.replace(/([A-Z])/g, " $1")}</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={value}
                  disabled={busy}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [key]: Number(event.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
        )}

        <button className="primary" type="submit" disabled={busy || !file}>
          {busy ? "Processing drawing…" : "Generate estimate package"}
        </button>

        {busy && (
          <div className="progress" aria-live="polite">
            <div className="bar"><span style={{ width: `${((stageIndex + 1) / stages.length) * 100}%` }} /></div>
            <p>{stages[stageIndex]}</p>
            <small>Large drawings can take several minutes because each floor is extracted and checked separately.</small>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </form>

      <section className="facts">
        <article>
          <strong>Conservative by design</strong>
          <span>Unresolved walls are excluded, not guessed.</span>
        </article>
        <article>
          <strong>Auditable</strong>
          <span>The ZIP includes Excel plus the complete extraction and validation JSON.</span>
        </article>
        <article>
          <strong>No fake structural accuracy</strong>
          <span>RCC and steel remain uncalculated without proper structural details.</span>
        </article>
      </section>
    </main>
  );
}
