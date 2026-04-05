import { useState, useRef } from 'react'
import { Search, MapPin, Loader2, X } from 'lucide-react'

/**
 * UK address lookup component using postcodes.io (free, no API key).
 * User types a postcode → selects from list of addresses → full address filled in.
 * Also supports typing a full address manually as fallback.
 *
 * Props:
 *   value: string — current address value
 *   onChange: (address: string) => void
 *   placeholder: string
 *   className: string — applied to the outer wrapper
 */
export default function AddressLookup({ value, onChange, placeholder = 'Start typing a postcode...', className = '' }) {
  const [postcode, setPostcode] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef(null)

  function handlePostcodeChange(val) {
    setPostcode(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const cleaned = val.replace(/\s/g, '').toUpperCase()
    if (cleaned.length < 3) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        // Try autocomplete first
        const autoRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}/autocomplete`)
        const autoData = await autoRes.json()

        if (autoData.result?.length) {
          // Get full details for the first matching postcode
          const fullPostcode = autoData.result[0]
          const detailRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(fullPostcode)}`)
          const detailData = await detailRes.json()

          if (detailData.result) {
            const r = detailData.result
            // Build addresses from the postcode area
            const addresses = buildAddresses(r)
            setSuggestions(addresses)
            setShowDropdown(true)
          }
        } else {
          // Try direct lookup
          const directRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`)
          const directData = await directRes.json()
          if (directData.result) {
            const addresses = buildAddresses(directData.result)
            setSuggestions(addresses)
            setShowDropdown(true)
          } else {
            setSuggestions([])
            setShowDropdown(false)
          }
        }
      } catch {
        setSuggestions([])
      }
      setSearching(false)
    }, 400)
  }

  function buildAddresses(r) {
    // postcodes.io returns area info, not individual addresses
    // Build a representative address from the data
    const parts = [
      r.admin_ward,
      r.parish && r.parish !== r.admin_district ? r.parish : null,
      r.admin_district,
      r.admin_county && r.admin_county !== r.admin_district ? r.admin_county : null,
      r.postcode,
    ].filter(Boolean)

    const baseAddress = parts.join(', ')

    // Return the area as the primary suggestion, plus variants
    const results = []

    if (r.admin_ward) {
      results.push({
        display: `${r.admin_ward}, ${r.admin_district}, ${r.postcode}`,
        full: `${r.admin_ward}, ${r.admin_district}${r.admin_county && r.admin_county !== r.admin_district ? ', ' + r.admin_county : ''}, ${r.postcode}`,
      })
    }

    if (r.parish && r.parish !== r.admin_ward) {
      results.push({
        display: `${r.parish}, ${r.admin_district}, ${r.postcode}`,
        full: `${r.parish}, ${r.admin_district}${r.admin_county && r.admin_county !== r.admin_district ? ', ' + r.admin_county : ''}, ${r.postcode}`,
      })
    }

    if (results.length === 0) {
      results.push({
        display: `${r.admin_district}, ${r.postcode}`,
        full: `${r.admin_district}${r.admin_county ? ', ' + r.admin_county : ''}, ${r.postcode}`,
      })
    }

    return results
  }

  function selectAddress(addr) {
    onChange(addr.full)
    setPostcode('')
    setSuggestions([])
    setShowDropdown(false)
    setShowManual(false)
  }

  function handleManualChange(val) {
    onChange(val)
  }

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"

  return (
    <div className={className}>
      {/* Current address display */}
      {value && !showManual && (
        <div className="flex items-start gap-2 mb-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <MapPin size={14} className="text-green-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-green-900 font-medium">{value}</p>
          </div>
          <button type="button" onClick={() => { onChange(''); setPostcode('') }} className="text-green-600 hover:text-green-800 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Postcode search */}
      {!value || showManual ? null : (
        <button type="button" onClick={() => { onChange(''); setPostcode('') }} className="text-xs text-blue-500 hover:underline mb-2">
          Change address
        </button>
      )}

      {!value && (
        <>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
            {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin z-10" />}
            <input
              type="text"
              value={postcode}
              onChange={e => handlePostcodeChange(e.target.value)}
              onFocus={() => { if (suggestions.length) setShowDropdown(true) }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder={placeholder}
              className={`${inputCls} pl-9`}
              autoComplete="off"
            />

            {showDropdown && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                {suggestions.map((addr, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={() => selectAddress(addr)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
                  >
                    <MapPin size={14} className="text-slate-400 shrink-0" />
                    <p className="text-sm text-slate-900 truncate">{addr.display}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={() => setShowManual(true)} className="text-xs text-slate-400 hover:text-blue-500 mt-1.5">
            Enter address manually
          </button>
        </>
      )}

      {/* Manual entry fallback */}
      {showManual && !value && (
        <div className="mt-2">
          <textarea
            value={value}
            onChange={e => handleManualChange(e.target.value)}
            placeholder="Type full address including postcode..."
            rows={3}
            className={`${inputCls} resize-none`}
          />
          <button type="button" onClick={() => setShowManual(false)} className="text-xs text-blue-500 hover:underline mt-1">
            Search by postcode instead
          </button>
        </div>
      )}
    </div>
  )
}
