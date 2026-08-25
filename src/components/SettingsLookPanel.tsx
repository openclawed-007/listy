import {
  DISPLAY_SCALE_OPTIONS,
  LOOK_PREF_OPTIONS,
  setPrefGroup,
  TIPS_PREF_OPTIONS,
  countEnabledPrefGroup,
  type InterfacePreferences,
} from "../lib/userPreferences";
import { SettingsPrefGroup } from "./SettingsPrefGroup";

interface Props {
  prefs: InterfacePreferences;
  onChange: (next: InterfacePreferences) => void;
}

export default function SettingsLookPanel({ prefs, onChange }: Props) {
  const tipsOn = countEnabledPrefGroup(prefs, TIPS_PREF_OPTIONS);
  return <>
    <section className="settings-card">
      <div className="settings-toggle-row"><span className="settings-toggle-copy"><strong>Size on big screens</strong><span>Phones and tablets stay compact. This only changes desktop.</span></span></div>
      <div className="settings-segment is-four" role="group" aria-label="Display scale">
        {DISPLAY_SCALE_OPTIONS.map((option) => {
          const active = prefs.displayScale === option.value;
          return <button key={option.value} type="button" className={`settings-segment-btn ${active ? "active" : ""}`} aria-pressed={active} onClick={() => onChange({ ...prefs, displayScale: option.value })}>{option.label}</button>;
        })}
      </div>
    </section>
    <section className="settings-card settings-card-list">
      <h3 className="settings-card-title">On the list</h3>
      <SettingsPrefGroup options={LOOK_PREF_OPTIONS} prefs={prefs} onToggle={(id) => onChange({ ...prefs, [id]: !prefs[id] })} />
    </section>
    <section className="settings-card settings-card-list">
      <div className="settings-toggle-row"><span className="settings-toggle-copy"><strong>Tips</strong><span>Turn these off once you know the app.</span></span></div>
      <div className="settings-preset-row">
        <button type="button" className="settings-preset-btn" onClick={() => onChange(setPrefGroup(prefs, TIPS_PREF_OPTIONS, true))}>Show all</button>
        <button type="button" className="settings-preset-btn" onClick={() => onChange(setPrefGroup(prefs, TIPS_PREF_OPTIONS, false))}>Hide all</button>
        <span className="settings-preset-count">{tipsOn} of {TIPS_PREF_OPTIONS.length} on</span>
      </div>
      <SettingsPrefGroup options={TIPS_PREF_OPTIONS} prefs={prefs} onToggle={(id) => onChange({ ...prefs, [id]: !prefs[id] })} />
    </section>
    <p className="settings-inline-note">Errors, confirmations, and essential labels stay visible.</p>
  </>;
}
