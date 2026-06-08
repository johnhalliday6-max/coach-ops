import { useEffect, useState } from "react";

export default function PlaceSearchBox({ label, value, setValue, placeholder, compact = false, onPick }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/place-search?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) {
            setSuggestions(data?.ok ? data.results || [] : []);
            setOpen(true);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error("Place search failed", err);
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  return (
    <div className={compact ? "route-search-field compact-search" : "route-search-field"}>
      <label>{label}</label>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {loading && <small className="search-loading">Searching...</small>}
      {open && suggestions.length > 0 && (
        <div className="place-suggestion-list">
          {suggestions.map((item) => (
            <button
              type="button"
              key={`${item.label}-${item.lat}-${item.lng}`}
              onClick={() => {
                setValue(item.label);
                onPick?.(item);
                setOpen(false);
              }}
            >
              <strong>{item.shortLabel}</strong>
              <small>{item.type ? `${item.type} · ` : ""}{item.label}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
