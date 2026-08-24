"use client";

import { useState, type FormEvent } from "react";

type SubmissionState = "idle" | "sending" | "success" | "error";

export default function ContactForm() {
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionState === "sending") return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmissionState("sending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          company: "",
          role: "",
          message: formData.get("message"),
        }),
      });

      if (!response.ok) throw new Error("Contact request failed");

      form.reset();
      setSubmissionState("success");
    } catch {
      setSubmissionState("error");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>
          YOUR NAME
          <input name="name" required placeholder="Full name" />
        </label>
        <label>
          WORK EMAIL
          <input name="email" required type="email" placeholder="you@company.com" />
        </label>
      </div>
      <label>
        HOW CAN WE HELP?
        <textarea
          name="message"
          required
          rows={5}
          placeholder="Tell us about your goals, verticals and current workflow."
        />
      </label>
      <button className="primary" type="submit" disabled={submissionState === "sending"}>
        {submissionState === "sending" ? "Sending..." : "SEND TO QENTRAX ↗"}
      </button>
      {(submissionState === "success" || submissionState === "error") && (
        <p aria-live="polite" role="status">
          {submissionState === "success"
            ? "Message sent."
            : "Unable to send. Please try again."}
        </p>
      )}
    </form>
  );
}
