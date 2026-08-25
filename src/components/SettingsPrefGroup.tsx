import type {
  InterfacePreferences,
  InterfaceToggleKey,
  PrefOption,
} from "../lib/userPreferences";

export function PrefSwitch({
  label,
  description,
  on,
  onToggle,
}: {
  label: string;
  description: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="settings-pref-row">
      <span className="settings-toggle-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <button
        type="button"
        className={`settings-switch ${on ? "is-on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
      >
        <span className="settings-switch-knob" />
      </button>
    </label>
  );
}

export function SettingsPrefGroup({
  options,
  prefs,
  onToggle,
}: {
  options: PrefOption[];
  prefs: InterfacePreferences;
  onToggle: (id: InterfaceToggleKey) => void;
}) {
  return (
    <ul className="settings-pref-list">
      {options.map((option) => (
        <li key={option.id}>
          <PrefSwitch
            label={option.label}
            description={option.description}
            on={prefs[option.id]}
            onToggle={() => onToggle(option.id)}
          />
        </li>
      ))}
    </ul>
  );
}
