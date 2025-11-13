'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getBiologicOptions,
  getApprovedDoses,
  getStandardFrequencies,
  formatFrequency,
  getBiologicByBrand,
} from '@/lib/biologics-data';

interface BiologicInputProps {
  value: {
    drugName: string;
    dose: string;
    frequency: string;
  };
  onChange: (value: { drugName: string; dose: string; frequency: string }) => void;
  required?: boolean;
  disabled?: boolean;
}

export default function BiologicInput({
  value,
  onChange,
  required = false,
  disabled = false,
}: BiologicInputProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [customFrequency, setCustomFrequency] = useState(false);
  const [frequencyNumber, setFrequencyNumber] = useState(1);
  const [frequencyUnit, setFrequencyUnit] = useState('weeks');

  const biologicOptions = useMemo(() => getBiologicOptions(), []);

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return biologicOptions;
    const term = searchTerm.toLowerCase();
    return biologicOptions.filter(
      opt =>
        opt.label.toLowerCase().includes(term) ||
        opt.value.toLowerCase().includes(term) ||
        opt.generic.toLowerCase().includes(term)
    );
  }, [searchTerm, biologicOptions]);

  // Get approved doses for selected biologic
  const approvedDoses = useMemo(() => {
    if (!value.drugName) return [];
    return getApprovedDoses(value.drugName);
  }, [value.drugName]);

  // Get standard frequencies for selected biologic
  const standardFrequencies = useMemo(() => {
    if (!value.drugName) return [];
    return getStandardFrequencies(value.drugName);
  }, [value.drugName]);

  // Update search term when drugName changes externally
  useEffect(() => {
    if (value.drugName) {
      const option = biologicOptions.find(opt => opt.value === value.drugName);
      if (option) {
        setSearchTerm(option.value);
      }
    }
  }, [value.drugName, biologicOptions]);

  const handleBiologicSelect = (brand: string) => {
    onChange({
      drugName: brand,
      dose: '',
      frequency: '',
    });
    setSearchTerm(brand);
    setShowDropdown(false);
  };

  const handleDoseChange = (dose: string) => {
    onChange({
      ...value,
      dose,
    });
  };

  const handleFrequencyChange = (freq: string) => {
    onChange({
      ...value,
      frequency: freq,
    });
  };

  const handleCustomFrequencyChange = () => {
    const customFreq = `every-${frequencyNumber}-${frequencyUnit}`;
    onChange({
      ...value,
      frequency: formatFrequency(frequencyNumber, frequencyUnit),
    });
  };

  const isDoseDisabled = disabled || !value.drugName;
  const isFrequencyDisabled = disabled || !value.drugName;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {/* Biologic Selection with Autocomplete */}
      <div className="md:col-span-1 relative">
        <label className="label">Biologic {required && '*'}</label>
        <div className="relative">
          <input
            type="text"
            className="input w-full pr-8"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(true);
              if (!e.target.value) {
                onChange({ drugName: '', dose: '', frequency: '' });
              }
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => {
              // Delay to allow click on dropdown item
              setTimeout(() => setShowDropdown(false), 200);
            }}
            placeholder="Type to search biologics..."
            required={required}
            disabled={disabled}
            autoComplete="off"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Dropdown */}
        {showDropdown && filteredOptions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border-2 border-primary-500 rounded-lg shadow-xl max-h-80 overflow-auto">
            <div className="py-1">
              {filteredOptions.slice(0, 20).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="w-full text-left px-4 py-3 hover:bg-primary-50 focus:bg-primary-50 focus:outline-none border-b border-gray-100 last:border-b-0 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur
                    handleBiologicSelect(option.value);
                  }}
                >
                  <div className="font-semibold text-gray-900">{option.value}</div>
                  <div className="text-sm text-gray-600">{option.generic}</div>
                </button>
              ))}
              {filteredOptions.length > 20 && (
                <div className="px-4 py-2 text-xs text-gray-500 text-center bg-gray-50">
                  Showing 20 of {filteredOptions.length} results
                </div>
              )}
            </div>
          </div>
        )}

        {searchTerm && filteredOptions.length === 0 && showDropdown && (
          <div className="absolute z-50 w-full mt-1 bg-white border-2 border-yellow-400 rounded-lg shadow-xl p-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>No biologics found matching &quot;{searchTerm}&quot;</span>
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1">
          {filteredOptions.length} biologic{filteredOptions.length !== 1 ? 's' : ''} available
        </p>
      </div>

      {/* Dose Selection */}
      <div>
        <label className="label">
          Dose
          {isDoseDisabled && <span className="ml-1 text-xs text-gray-400">(select biologic first)</span>}
        </label>
        <select
          className={`input w-full ${isDoseDisabled ? 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60' : ''}`}
          value={value.dose}
          onChange={(e) => handleDoseChange(e.target.value)}
          disabled={isDoseDisabled}
          style={isDoseDisabled ? { pointerEvents: 'none' } : {}}
        >
          <option value="">
            {isDoseDisabled ? '-- Disabled --' : 'Select dose'}
          </option>
          {approvedDoses.map((dose) => (
            <option key={dose} value={dose}>
              {dose}
            </option>
          ))}
        </select>
        {value.drugName && approvedDoses.length > 0 && (
          <p className="text-xs text-green-600 mt-1">
            ✓ {approvedDoses.length} approved dose{approvedDoses.length !== 1 ? 's' : ''} available
          </p>
        )}
        {value.drugName && approvedDoses.length === 0 && (
          <p className="text-xs text-yellow-600 mt-1">
            ⚠ No standard doses defined for {value.drugName}
          </p>
        )}
      </div>

      {/* Frequency Selection */}
      <div>
        <label className="label">
          Frequency
          {isFrequencyDisabled && <span className="ml-1 text-xs text-gray-400">(select biologic first)</span>}
        </label>
        {!customFrequency ? (
          <div className="space-y-2">
            <select
              className={`input w-full ${isFrequencyDisabled ? 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60' : ''}`}
              value={value.frequency}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setCustomFrequency(true);
                } else {
                  handleFrequencyChange(e.target.value);
                }
              }}
              disabled={isFrequencyDisabled}
              style={isFrequencyDisabled ? { pointerEvents: 'none' } : {}}
            >
              <option value="">
                {isFrequencyDisabled ? '-- Disabled --' : 'Select frequency'}
              </option>
              {standardFrequencies.map((freq) => (
                <option key={freq.value} value={freq.label}>
                  {freq.label}
                </option>
              ))}
              {!isFrequencyDisabled && (
                <option value="custom">➕ Custom frequency...</option>
              )}
            </select>
            {value.drugName && standardFrequencies.length > 0 && (
              <p className="text-xs text-green-600">
                ✓ {standardFrequencies.length} standard frequenc{standardFrequencies.length !== 1 ? 'ies' : 'y'} available
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-600 block mb-1">Every</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  className="input w-full"
                  value={frequencyNumber}
                  onChange={(e) => setFrequencyNumber(parseInt(e.target.value) || 1)}
                  placeholder="#"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-600 block mb-1">Unit</label>
                <select
                  className="input w-full"
                  value={frequencyUnit}
                  onChange={(e) => setFrequencyUnit(e.target.value)}
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 text-sm px-3 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 font-medium"
                onClick={() => {
                  handleCustomFrequencyChange();
                  setCustomFrequency(false);
                }}
              >
                ✓ Apply
              </button>
              <button
                type="button"
                className="flex-1 text-sm px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                onClick={() => setCustomFrequency(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
