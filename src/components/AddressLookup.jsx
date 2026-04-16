import { useState, useRef } from 'react'
import { Search, MapPin, Loader2, X } from 'lucide-react'

/**
 * UK address lookup using postcodes.io (free, no API key).
 * 1. Type a postcode → autocomplete dropdown of matching postcodes
 * 2. Select postcode → shows area details (ward, district, county)
 * 3. User types their house number/street name
 * 4. Full address is assembled and saved
 *
 * Props:
 *   value: string — current full address
 *   onChange: (address: string) => void
 */
export default function AddressLookup({ value, onChange, placeholder = 'Start typing a postcode...' }) {
  const [postcodeInput, setPostcodeInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedArea, setSelectedArea] = useState(null) // { postcode, ward, district, county }
  const [streetLine, setStreetLine] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [manualText, setManualText] = useState(value || '')
  const debounceRef = useRef(null)

  function handlePostcodeInput(val) {
    setPostcodeInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (val.trim().length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(val.trim())}/autocomplete`)
        const data = await res.json()
        if (data.result?.length) {
          setSuggestions(data.result)
          setShowDropdown(true)
        } else {
          setSuggestions([])
          setShowDropdown(false)
        }
      } catch {
        setSuggestions([])
        setShowDropdown(false)
      }
      setSearching(false)
    }, 300)
  }

  async function selectPostcode(pc) {
    setShowDropdown(false)
    setSuggestions([])
    setPostcodeInput(pc)
    setSearching(true)

    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`)
      const data = await res.json()
      if (data.result) {
        const r = data.result
        setSelectedArea({
          postcode: r.postcode,
          ward: r.admin_ward || '',
          district: r.admin_district || '',
          county: r.admin_county || '',
        })
        setStreetLine('')
      }
    } catch { /* ignore — lookup failed */ }
    setSearching(false)
  }

  function confirmAddress() {
    if (!selectedArea) return
    const parts = [
      streetLine.trim(),
      selectedArea.ward,
      selectedArea.district,
      selectedArea.county && selectedArea.county !== selectedArea.district ? selectedArea.county : null,
      selectedArea.postcode,
    ].filter(Boolean)
    onChange(parts.join(', '))
    setSelectedArea(null)
    setPostcodeInput('')
    setStreetLine('')
  }

  function clearAddress() {
    onChange('')
    setSelectedArea(null)
    setPostcodeInput('')
    setStreetLine('')
    setShowManual(false)
    setManualText('')
  }

  function saveManual() {
    if (manualText.trim()) {
      onChange(manualText.trim())
      setShowManual(false)
    }
  }

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"

  // Already have an address — show it
  if (value && !selectedArea && !showManual) {
    return (
      <div>
        <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <MapPin size={14} className="text-green-600 mt-0.5 shrink-0" />
          <p className="text-sm text-green-900 font-medium flex-1">{value}</p>
          <button type="button" onClick={clearAddress} className="text-green-600 hover:text-green-800 shrink-0">
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  // Postcode selected — ask for house number / street
  if (selectedArea) {
    return (
      <div className="space-y-2">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-600 font-semibold mb-1">{selectedArea.postcode}</p>
          <p className="text-sm text-blue-900">
            {[selectedArea.ward, selectedArea.district, selectedArea.county && selectedArea.county !== selectedArea.district ? selectedArea.county : null].filter(Boolean).join(', ')}
          </p>
        </div>
        <input
          type="text"
          value={streetLine}
          onChange={e => setStreetLine(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAddress() } }}
          placeholder="House number and street name (e.g. 14 Oak Road)"
          className={inputCls}
          autoFocus
        />
        <div className="flex gap-2">
          <button type="button" onClick={confirmAddress} disabled={!streetLine.trim()}
            className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
            Confirm Address
          </button>
          <button type="button" onClick={() => { setSelectedArea(null); setPostcodeInput('') }}
            className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50">
            Back
          </button>
        </div>
      </div>
    )
  }

  // Manual entry mode
  if (showManual) {
    return (
      <div className="space-y-2">
        <textarea
          value={manualText}
          onChange={e => setManualText(e.target.value)}
          placeholder="Type full address including postcode..."
          rows={3}
          className={`${inputCls} resize-none`}
        />
        <div className="flex gap-2">
          <button type="button" onClick={saveManual} disabled={!manualText.trim()}
            className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
            Save Address
          </button>
          <button type="button" onClick={() => setShowManual(false)}
            className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50">
            Search by postcode
          </button>
        </div>
      </div>
    )
  }

  // Search mode
  return (
    <div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
        {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin z-10" />}
        <input
          type="text"
          value={postcodeInput}
          onChange={e => handlePostcodeInput(e.target.value)}
          onFocus={() => { if (suggestions.length) setShowDropdown(true) }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder={placeholder}
          className={`${inputCls} pl-9`}
          autoComplete="off"
        />

        {showDropdown && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
            {suggestions.map((pc, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={() => selectPostcode(pc)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
              >
                <MapPin size={14} className="text-blue-500 shrink-0" />
                <span className="text-sm font-medium text-slate-900">{pc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={() => setShowManual(true)} className="text-xs text-slate-400 hover:text-blue-500 mt-1.5">
        Can't find your postcode? Enter address manually
      </button>
    </div>
  )
}
