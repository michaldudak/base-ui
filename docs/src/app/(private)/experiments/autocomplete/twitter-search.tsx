'use client';

import * as React from 'react';
import { Autocomplete } from '@base-ui-components/react/autocomplete';

interface Suggestion {
  title?: string;
  searchString: string;
  imageUrl?: string;
}

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: Suggestion[];
  onRemoveSuggestion?: (suggestion: Suggestion) => void;
  onRemoveAllSuggestions?: () => void;
  placeholder?: string;
}

export default function Experiment() {
  const [recentSearches, setRecentSearches] = React.useState<Suggestion[]>([
    {
      title: 'Base UI',
      searchString: '@base_ui',
      imageUrl: 'https://pbs.twimg.com/profile_images/1863598700473335808/YVP32qSQ_x96.jpg',
    },
    { searchString: '#react' },
    {
      title: 'James',
      searchString: '@atomiksdev',
      imageUrl: 'https://pbs.twimg.com/profile_images/1473022717381070848/CaDk4K_H_x96.jpg',
    },
    {
      title: 'Colm Tuite',
      searchString: '@colmtuite',
      imageUrl: 'https://pbs.twimg.com/profile_images/1907688428398850048/zAuYRr83_x96.jpg',
    },
    {
      title: 'Marija Najdova',
      searchString: '@marijanajdova',
      imageUrl: 'https://pbs.twimg.com/profile_images/1877079167616872448/Qu65t_ID_x96.jpg',
    },
    {
      title: 'Michał Dudak',
      searchString: '@michaldudak',
      imageUrl: 'https://pbs.twimg.com/profile_images/1400039759003766785/1eFwPvgW_x96.jpg',
    },
    {
      title: 'Albert Yu',
      searchString: '@mj12albert',
      imageUrl: 'https://pbs.twimg.com/profile_images/2475435882/hgx3w3i957zlwlipabfr_x96.jpeg',
    },
  ]);

  const [value, setValue] = React.useState('');

  const handleRemoveSuggestion = (suggestion: Suggestion) => {
    setRecentSearches((prev) => prev.filter((item) => item !== suggestion));
  };

  const handleRemoveAllSuggestions = () => {
    setRecentSearches([]);
  };

  return (
    <div className="max-w-md">
      <h1>Twitter search box</h1>
      <style>
        {`
        :root {
          --color-accent: rgb(29, 155, 240);
          --color-border: rgb(239, 243, 244);
          --color-icon: rgb(83, 100, 113);
          --color-highlight-bg: rgb(247, 249, 249);
          --shadow-popup: rgba(101, 119, 134, 0.2) 0px 0px 15px, rgba(101, 119, 134, 0.15) 0px 0px 3px 1px;
        }`}
      </style>
      <SearchBox
        value={value}
        onChange={setValue}
        suggestions={recentSearches}
        onRemoveSuggestion={handleRemoveSuggestion}
        onRemoveAllSuggestions={handleRemoveAllSuggestions}
        placeholder="Search"
      />
    </div>
  );
}

function SearchBox(props: SearchBoxProps) {
  const { placeholder, value, onChange, suggestions, onRemoveSuggestion, onRemoveAllSuggestions } =
    props;

  const [open, setOpen] = React.useState(false);

  return (
    <Autocomplete.Root
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={onChange}
      items={suggestions}
      filter={null}
    >
      <div className="flex gap-2 items-center box-border h-10 w-sm rounded-full border border-(--color-border) p-[1px] focus-within:p-0 focus-within:border-2 focus-within:border-(--color-accent)">
        <SearchIcon className="pl-3 h-4 fill-(--color-icon)" />
        <Autocomplete.Input
          placeholder={placeholder}
          className="grow text-sm mr-4 aret-(--color-accent) focus-visible:outline-hidden"
        />
      </div>

      <Autocomplete.Portal>
        <Autocomplete.Positioner className="outline-none" sideOffset={10} alignOffset={-10}>
          <Autocomplete.Popup className="w-sm max-h-[min(var(--available-height),80vh)] max-w-[var(--available-width)] overflow-y-auto overscroll-contain rounded-md bg-[canvas] text-gray-900 shadow-(--shadow-popup)">
            {value === '' ? (
              <React.Fragment>
                <RecentSearchesHeader onRemoveAll={onRemoveAllSuggestions} />
                <Autocomplete.List>
                  {(suggestion: Suggestion) => (
                    <RecentSearchItem
                      key={suggestion.searchString}
                      suggestion={suggestion}
                      onRemove={onRemoveSuggestion}
                    />
                  )}
                </Autocomplete.List>
              </React.Fragment>
            ) : (
              <Autocomplete.List>
                {(suggestion: Suggestion) => (
                  <SearchResultItem key={suggestion.searchString} suggestion={suggestion} />
                )}
              </Autocomplete.List>
            )}
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

interface RecentSearchItemProps {
  suggestion: Suggestion;
  onRemove?: (suggestion: Suggestion) => void;
}

function RecentSearchItem({ suggestion, onRemove }: RecentSearchItemProps) {
  return (
    <Autocomplete.Item
      key={suggestion.searchString}
      className="px-4 py-3 data-highlighted:bg-(--color-highlight-bg) cursor-pointer transition-colors duration-200"
      value={suggestion}
    >
      <div className="flex gap-2">
        <div className="size-10">
          {suggestion.imageUrl ? (
            <img
              src={suggestion.imageUrl}
              alt={suggestion.title}
              className="rounded-full size-10"
            />
          ) : (
            <div className="size-10 flex items-center justify-center">
              <SearchIcon className="h-5 text-(--color-icon)" />
            </div>
          )}
        </div>
        <div className="flex grow flex-col justify-center">
          {suggestion.title && <div className="font-bold">{suggestion.title}</div>}
          <div>{suggestion.searchString}</div>
        </div>
        <div className="w-9 flex items-center justify-center">
          <RemoveIcon className="size-4.5 stroke-none fill-(--color-accent)" />
        </div>
      </div>
    </Autocomplete.Item>
  );
}

function SearchResultItem(props: { suggestion: Suggestion }) {
  const { suggestion } = props;
  return null;
}

function RecentSearchesHeader(props: { onRemoveAll?: () => void }) {
  const { onRemoveAll } = props;
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="text-xl font-bold text-gray-900">Recent</div>
      {onRemoveAll && (
        <button
          type="button"
          className="text-(--color-accent) font-bold cursor-pointer"
          onClick={onRemoveAll}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g>
        <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z"></path>
      </g>
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[24px]">
      <g>
        <path
          stroke="currentcolor"
          d="M12 1.75C6.34 1.75 1.75 6.34 1.75 12S6.34 22.25 12 22.25 22.25 17.66 22.25 12 17.66 1.75 12 1.75zm3.71 12.54l-1.42 1.42-2.29-2.3-2.29 2.3-1.42-1.42 2.3-2.29-2.3-2.29 1.42-1.42 2.29 2.3 2.29-2.3 1.42 1.42-2.3 2.29 2.3 2.29z"
        />
      </g>
    </svg>
  );
}

function RemoveIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g>
        <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"></path>
      </g>
    </svg>
  );
}
