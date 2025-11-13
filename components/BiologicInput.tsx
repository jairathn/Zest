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
        <input
          type="text"
          className="input w-full"
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
          placeholder="Start typing to search..."
          required={required}
          disabled={disabled}
          autoComplete="off"
        />

        {/* Dropdown */}
        {showDropdown && filteredOptions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                onClick={() => handleBiologicSelect(option.value)}
              >
                <div className="font-medium">{option.value}</div>
                <div className="text-sm text-gray-600">{option.generic}</div>
              </button>
            ))}
          </div>
        )}

        {searchTerm && filteredOptions.length === 0 && showDropdown && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-sm text-gray-500">
            No biologics found matching &quot;{searchTerm}&quot;
          </div>
        )}
      </div>

      {/* Dose Selection */}
      <div>
        <label className="label">Dose</label>
        <select
          className={`input w-full ${isDoseDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          value={value.dose}
          onChange={(e) => handleDoseChange(e.target.value)}
          disabled={isDoseDisabled}
        >
          <option value="">
            {isDoseDisabled ? 'Select biologic first' : 'Select dose'}
          </option>
          {approvedDoses.map((dose) => (
            <option key={dose} value={dose}>
              {dose}
            </option>
          ))}
        </select>
        {value.drugName && approvedDoses.length === 0 && (
          <p className="text-xs text-gray-500 mt-1">
            No standard doses defined
          </p>
        )}
      </div>

      {/* Frequency Selection */}
      <div>
        <label className="label">Frequency</label>
        {!customFrequency ? (
          <div className="space-y-2">
            <select
              className={`input w-full ${isFrequencyDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              value={value.frequency}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setCustomFrequency(true);
                } else {
                  handleFrequencyChange(e.target.value);
                }
              }}
              disabled={isFrequencyDisabled}
            >
              <option value="">
                {isFrequencyDisabled ? 'Select biologic first' : 'Select frequency'}
              </option>
              {standardFrequencies.map((freq) => (
                <option key={freq.value} value={freq.label}>
                  {freq.label}
                </option>
              ))}
              {!isFrequencyDisabled && (
                <option value="custom">Custom frequency...</option>
              )}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  min="1"
                  max="365"
                  className="input w-full"
                  value={frequencyNumber}
                  onChange={(e) => setFrequencyNumber(parseInt(e.target.value) || 1)}
                  placeholder="Number"
                />
              </div>
              <div className="flex-1">
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
                className="text-sm text-primary-600 hover:text-primary-700"
                onClick={() => {
                  handleCustomFrequencyChange();
                  setCustomFrequency(false);
                }}
              >
                Apply
              </button>
              <button
                type="button"
                className="text-sm text-gray-600 hover:text-gray-700"
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
