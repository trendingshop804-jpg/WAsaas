import React from 'react';
import { LeadFilterOptions, FollowUpFilterCategory, LeadStatus } from '../../types';
import { Search, Filter, Calendar, ArrowUpDown, X } from 'lucide-react';

interface LeadFilterBarProps {
  filters: LeadFilterOptions;
  setFilters: React.Dispatch<React.SetStateAction<LeadFilterOptions>>;
  totalResults: number;
}

export const LeadFilterBar: React.FC<LeadFilterBarProps> = ({
  filters,
  setFilters,
  totalResults,
}) => {
  const statuses: { label: string; value: string }[] = [
    { label: 'All Statuses', value: 'all' },
    { label: 'New', value: 'New' },
    { label: 'Contacted', value: 'Contacted' },
    { label: 'Interested', value: 'Interested' },
    { label: 'Follow-up', value: 'Follow-up' },
    { label: 'Won', value: 'Won' },
    { label: 'Lost', value: 'Lost' },
  ];

  const categories: { label: string; value: FollowUpFilterCategory }[] = [
    { label: 'All Dates', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'Overdue', value: 'overdue' },
    { label: 'Upcoming', value: 'upcoming' },
  ];

  const hasActiveFilters =
    filters.search !== '' ||
    filters.status !== 'all' ||
    filters.category !== 'all' ||
    filters.sortBy !== 'newest';

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      category: 'all',
      sortBy: 'newest',
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
        {/* Search Field */}
        <div className="lg:col-span-4 relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Search by name, phone, email..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
          />
          {filters.search && (
            <button
              onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
              className="absolute right-3 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="lg:col-span-3 relative flex items-center">
          <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="w-full pl-10 pr-8 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Follow-up Date Category Filter */}
        <div className="lg:col-span-3 relative flex items-center">
          <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, category: e.target.value as FollowUpFilterCategory }))
            }
            className="w-full pl-10 pr-8 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Dropdown */}
        <div className="lg:col-span-2 relative flex items-center">
          <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <select
            value={filters.sortBy}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                sortBy: e.target.value as 'newest' | 'oldest' | 'next_follow_up',
              }))
            }
            className="w-full pl-10 pr-8 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="next_follow_up">Next Follow-up</option>
          </select>
        </div>
      </div>

      {/* Filter Info Bar & Clear Button */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
        <span>
          Showing <strong className="text-white font-bold">{totalResults}</strong> matching {totalResults === 1 ? 'lead' : 'leads'}
        </span>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear Filters</span>
          </button>
        )}
      </div>
    </div>
  );
};
