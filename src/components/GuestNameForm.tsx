// src/components/GuestNameForm.tsx
//
// The only thing an invited guest is asked before joining: a name for the
// squad list. One field, no account, no email — the whole point of letting
// attendees in without signup is that this is all that stands between a
// shared link and being on the crawl.

import React, { useState } from "react";
import { GUEST_NAME_MAX } from "../hooks/useGuestName";
import "../styles/GuestName.css";

interface GuestNameFormProps {
  title: string;
  subtitle: string;
  cta: string;
  onSubmit: (name: string) => void;
}

const GuestNameForm: React.FC<GuestNameFormProps> = ({
  title,
  subtitle,
  cta,
  onSubmit,
}) => {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  return (
    <form
      className="guest-name"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <span className="guest-name-brand">BarHop</span>
      <h1 className="guest-name-title">{title}</h1>
      <p className="guest-name-subtitle">{subtitle}</p>
      <label className="field">
        <span className="field-label">Your name</span>
        <input
          className="field-input"
          type="text"
          autoFocus
          autoComplete="given-name"
          enterKeyHint="go"
          maxLength={GUEST_NAME_MAX}
          placeholder="What should the group call you?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className="btn btn--primary btn--lg btn--full"
        disabled={!trimmed}
      >
        {cta}
      </button>
      <p className="guest-name-fineprint">No account or app needed.</p>
    </form>
  );
};

export default GuestNameForm;
