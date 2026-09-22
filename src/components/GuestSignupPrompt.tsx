// src/components/GuestSignupPrompt.tsx
//
// The moment a guest hits something that needs an account. The copy is framed
// on what is actually true — the crawl lives on this device — not on an expiry
// we impose, because the spec rejects manufactured urgency (§6.2).
//
// Google is visually primary at this moment on purpose (spec §9): it is
// pre-verified and one tap, so it is the cheapest possible path out of the
// highest-intent moment in the product.

import React from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "../context/useAuth";
import { toast } from "./Toaster";
import "../styles/GuestSignupPrompt.css";

export type GuestPromptReason = "save" | "live" | "plan" | "search";

interface GuestSignupPromptProps {
  open: boolean;
  reason: GuestPromptReason;
  onClose: () => void;
}

const HEADLINES: Record<GuestPromptReason, string> = {
  save: "Save this crawl",
  live: "Start the crawl",
  plan: "Plan it together",
  search: "Sign up to keep searching",
};

// "search" is the daily guest pool running out, which is a different promise
// from losing the crawl — telling someone their crawl is at risk when it is
// not would be a lie in the service of a conversion.
const BODIES: Record<GuestPromptReason, string> = {
  save: "This crawl is only on this device — save it so it's there on the night.",
  live: "This crawl is only on this device — save it so it's there on the night.",
  plan: "This crawl is only on this device — save it so it's there on the night.",
  search:
    "Guest searches are used up for today. An account gets you the full allowance.",
};

const GuestSignupPrompt: React.FC<GuestSignupPromptProps> = ({
  open,
  reason,
  onClose,
}) => {
  const navigate = useNavigate();
  const { signinWithGoogle } = useAuth();

  const handleGoogle = async () => {
    try {
      await signinWithGoogle();
      onClose();
    } catch {
      toast.error("Couldn't finish sign-up — try again");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-panel guest-prompt"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="guest-prompt__title">{HEADLINES[reason]}</h2>
            <p className="guest-prompt__body">{BODIES[reason]}</p>
            <button
              className="btn btn--primary btn--full guest-prompt__google"
              onClick={handleGoogle}
            >
              <FcGoogle size={20} />
              Continue with Google
            </button>
            <button
              className="btn btn--ghost btn--full guest-prompt__email"
              onClick={() => navigate("/signup")}
            >
              Sign up with email
            </button>
            <button className="guest-prompt__dismiss" onClick={onClose}>
              Keep looking around
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GuestSignupPrompt;
