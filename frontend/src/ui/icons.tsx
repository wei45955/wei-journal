/**
 * One icon family, drawn for this journal on a 24 grid with a 1.6 stroke and
 * round ends, so every icon sits at the same weight as the system text.
 */

import type { ReactNode, SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
  strokeWidth?: number
}

function icon(paths: ReactNode, filled = false) {
  return function Icon({ size = 22, strokeWidth = 1.6, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    )
  }
}

export const PenIcon = icon(
  <>
    <path d="M14.5 5.5l4 4L9 19l-4.5 1 1-4.5z" />
    <path d="M12.5 7.5l4 4" />
  </>,
)
export const BookIcon = icon(
  <>
    <path d="M6 3.75h11a1.25 1.25 0 0 1 1.25 1.25v14a1.25 1.25 0 0 1-1.25 1.25H6A1.25 1.25 0 0 1 4.75 19V5A1.25 1.25 0 0 1 6 3.75z" />
    <path d="M8.5 3.75v16.5" />
    <path d="M11.5 8h4M11.5 11h3" />
  </>,
)
export const ArchiveIcon = icon(
  <>
    <rect x="3.75" y="5" width="16.5" height="15.25" rx="2.25" />
    <path d="M3.75 9.5h16.5M8 3v3.5M16 3v3.5" />
    <circle cx="8.5" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  </>,
)
export const PlaceIcon = icon(
  <>
    <path d="M12 21s-6.75-5.6-6.75-11.25a6.75 6.75 0 0 1 13.5 0C18.75 15.4 12 21 12 21z" />
    <circle cx="12" cy="9.75" r="2.4" />
  </>,
)
export const SearchIcon = icon(
  <>
    <circle cx="10.75" cy="10.75" r="6.25" />
    <path d="M15.5 15.5l4.5 4.5" />
  </>,
)
export const GearIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2.6-1.5L14 2.6h-4l-.5 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.5 7.5 0 0 0 2.6-1.5l2.3 1 2-3.4z" />
  </>,
)
export const ChevronLeftIcon = icon(<path d="M14.5 5.5L8 12l6.5 6.5" />)
export const ChevronRightIcon = icon(<path d="M9.5 5.5L16 12l-6.5 6.5" />)
export const ChevronDownIcon = icon(<path d="M6 9.5l6 6 6-6" />)
export const ChevronUpIcon = icon(<path d="M6 14.5l6-6 6 6" />)
export const MoreIcon = icon(
  <>
    <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>,
)
export const CloseIcon = icon(<path d="M6 6l12 12M18 6L6 18" />)
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />)
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />)
export const MinusIcon = icon(<path d="M5 12h14" />)
export const FilterIcon = icon(
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>,
)
export const SelectIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M8.25 12.25l2.5 2.5 5-5" />
  </>,
)
export const ImageIcon = icon(
  <>
    <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="2.5" />
    <circle cx="9" cy="9.75" r="1.6" />
    <path d="M20.25 15.5l-4.5-4.5-8.5 8.25" />
  </>,
)
export const VideoIcon = icon(
  <>
    <rect x="3.25" y="6" width="12.5" height="12" rx="2.25" />
    <path d="M15.75 10.25l5-3v9.5l-5-3" />
  </>,
)
export const FileIcon = icon(
  <>
    <path d="M13.5 3.5H7.25a1.75 1.75 0 0 0-1.75 1.75v13.5a1.75 1.75 0 0 0 1.75 1.75h9.5a1.75 1.75 0 0 0 1.75-1.75V8.5z" />
    <path d="M13.5 3.5v5h5" />
  </>,
)
export const AudioIcon = icon(
  <>
    <path d="M9 18V6.5l10-2V16" />
    <circle cx="6.75" cy="18" r="2.25" />
    <circle cx="16.75" cy="16" r="2.25" />
  </>,
)
export const SketchIcon = icon(
  <>
    <path d="M3.5 16.5c2.5-6 5-8.5 6.5-7s-2 6 0 7 4.5-6 7-6 1.5 4 3.5 4.5" />
  </>,
)
export const TagIcon = icon(
  <>
    <path d="M3.75 12.25V5a1.25 1.25 0 0 1 1.25-1.25h7.25l8 8a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z" />
    <circle cx="8.25" cy="8.25" r="1.4" />
  </>,
)
export const FolderIcon = icon(
  <path d="M3.75 7a1.75 1.75 0 0 1 1.75-1.75h4l2 2.25h7a1.75 1.75 0 0 1 1.75 1.75v8.25A1.75 1.75 0 0 1 18.5 19.25h-13A1.75 1.75 0 0 1 3.75 17.5z" />,
)
export const InboxIcon = icon(
  <>
    <path d="M3.75 13.5l2.4-7.2A1.75 1.75 0 0 1 7.8 5.1h8.4a1.75 1.75 0 0 1 1.65 1.2l2.4 7.2v4.75a1.75 1.75 0 0 1-1.75 1.75H5.5a1.75 1.75 0 0 1-1.75-1.75z" />
    <path d="M3.75 13.5H8.5l1 2h5l1-2h4.75" />
  </>,
)
export const StackIcon = icon(
  <>
    <path d="M12 4l8.25 4.25L12 12.5 3.75 8.25z" />
    <path d="M3.75 12.25L12 16.5l8.25-4.25M3.75 16L12 20.25 20.25 16" />
  </>,
)
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 7.5V12l3 2" />
  </>,
)
export const TextIcon = icon(
  <>
    <path d="M3.5 18.5l4.5-12 4.5 12M5.2 14h5.6" />
    <path d="M15 12.6a2.6 2.6 0 0 1 5 1v4.9M20 15.6c-3.3-.2-5.3.5-5.3 1.6 0 1.6 3.6 1.9 5.3-.4" />
  </>,
)
export const BoldIcon = icon(
  <path d="M7.5 5h5.25a3.25 3.25 0 0 1 0 6.5H7.5zM7.5 11.5h6a3.5 3.5 0 0 1 0 7h-6z" strokeWidth={2} />,
)
export const ItalicIcon = icon(<path d="M10 5h7M7 19h7M14 5l-4 14" />)
export const UnderlineIcon = icon(<path d="M7 4.5V11a5 5 0 0 0 10 0V4.5M5.5 19.5h13" />)
export const StrikeIcon = icon(
  <path d="M5 12h14M16 7.5c-.6-1.6-2.1-2.5-4-2.5-2.3 0-4 1.2-4 3 0 1.3.9 2.2 2.4 2.8M8 16.5c.6 1.6 2.1 2.5 4 2.5 2.3 0 4-1.3 4-3.1 0-.7-.2-1.3-.6-1.8" />,
)
export const ListIcon = icon(
  <>
    <path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10" />
    <circle cx="5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="5" cy="17.5" r="1" fill="currentColor" stroke="none" />
  </>,
)
export const OrderedListIcon = icon(
  <>
    <path d="M10 6.5h10M10 12h10M10 17.5h10" />
    <path d="M4.25 5.25l1.25-.75v4M4 15.75a1.3 1.3 0 0 1 2.4.6c0 .9-2.4 1.9-2.4 2.65h2.5" strokeWidth={1.4} />
  </>,
)
export const QuoteIcon = icon(
  <>
    <path d="M5 11.5h4v5H5v-4c0-2.5 1-4.2 3-5" />
    <path d="M14 11.5h4v5h-4v-4c0-2.5 1-4.2 3-5" />
  </>,
)
export const LinkIcon = icon(
  <>
    <path d="M10.5 13.5a3.75 3.75 0 0 0 5.3 0l2.65-2.65a3.75 3.75 0 0 0-5.3-5.3l-1 1" />
    <path d="M13.5 10.5a3.75 3.75 0 0 0-5.3 0l-2.65 2.65a3.75 3.75 0 0 0 5.3 5.3l1-1" />
  </>,
)
export const UndoIcon = icon(
  <>
    <path d="M8.5 6L4.5 10l4 4" />
    <path d="M4.5 10H14a5.5 5.5 0 0 1 0 11h-3" />
  </>,
)
export const RedoIcon = icon(
  <>
    <path d="M15.5 6l4 4-4 4" />
    <path d="M19.5 10H10a5.5 5.5 0 0 0 0 11h3" />
  </>,
)
export const TrashIcon = icon(
  <>
    <path d="M4.5 6.75h15M9.5 6.75V4.75h5v2M6.5 6.75l.9 12.1a1.75 1.75 0 0 0 1.75 1.65h5.7a1.75 1.75 0 0 0 1.75-1.65l.9-12.1" />
    <path d="M10.25 10.5v6M13.75 10.5v6" />
  </>,
)
export const CopyIcon = icon(
  <>
    <rect x="8.25" y="8.25" width="11.5" height="11.5" rx="2" />
    <path d="M15.75 8.25V6a1.75 1.75 0 0 0-1.75-1.75H6A1.75 1.75 0 0 0 4.25 6v8A1.75 1.75 0 0 0 6 15.75h2.25" />
  </>,
)
export const PinIcon = icon(
  <>
    <path d="M9 3.75h6l-1 5.5 3.5 3.25v1.75h-11V12.5L10 9.25z" />
    <path d="M12 14.25v6" />
  </>,
)
export const DownloadIcon = icon(
  <>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4.5 16.5v1.75A1.75 1.75 0 0 0 6.25 20h11.5a1.75 1.75 0 0 0 1.75-1.75V16.5" />
  </>,
)
export const LocateIcon = icon(
  <>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <path d="M12 2.75v2.75M12 18.5v2.75M2.75 12h2.75M18.5 12h2.75" />
  </>,
)
export const SparkIcon = icon(
  <path d="M12 3.5c.6 4.1 2.4 5.9 6.5 6.5-4.1.6-5.9 2.4-6.5 6.5-.6-4.1-2.4-5.9-6.5-6.5 4.1-.6 5.9-2.4 6.5-6.5zM18.5 15.5c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5z" />,
)
export const StarIcon = icon(
  <path d="M12 4l2.4 5 5.35.6-4 3.7 1.1 5.3L12 15.9l-4.85 2.7 1.1-5.3-4-3.7L9.6 9z" />,
)
export const StarFilledIcon = icon(
  <path d="M12 4l2.4 5 5.35.6-4 3.7 1.1 5.3L12 15.9l-4.85 2.7 1.1-5.3-4-3.7L9.6 9z" />,
  true,
)
export const KeyboardDownIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="11" rx="2" />
    <path d="M7 8h.01M10.5 8h.01M14 8h.01M17 8h.01M8 11.5h8M9.5 18.5l2.5 2 2.5-2" />
  </>,
)
export const ArrowUpIcon = icon(<path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" />)
export const ArrowDownIcon = icon(<path d="M12 5v14M6.5 13.5L12 19l5.5-5.5" />)
export const ListLinesIcon = icon(<path d="M5 7h14M5 12h14M5 17h14" />)
export const LiveIcon = icon(
  <>
    <circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="8.25" strokeDasharray="1.4 2.2" />
  </>,
)
export const EraserIcon = icon(
  <>
    <path d="M8.5 19.5l-4-4a1.75 1.75 0 0 1 0-2.5l8.5-8.5a1.75 1.75 0 0 1 2.5 0l4 4a1.75 1.75 0 0 1 0 2.5l-8 8.5z" />
    <path d="M8.5 19.5H20M9 9l6 6" />
  </>,
)
export const SortIcon = icon(<path d="M7.5 4.5v15M4 16l3.5 3.5L11 16M16.5 19.5v-15M13 8l3.5-3.5L20 8" />)
export const SignOutIcon = icon(
  <>
    <path d="M14 4.5H6.75A1.75 1.75 0 0 0 5 6.25v11.5a1.75 1.75 0 0 0 1.75 1.75H14" />
    <path d="M10 12h10M16.5 8.5L20 12l-3.5 3.5" />
  </>,
)
