/**
 * A single icon set drawn on a 24 unit grid with a consistent 1.6 stroke.
 * Every icon is decorative by default; pass a title when it is the only
 * label of a control.
 */
import type { SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
}

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const TimelineIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 4.5h14M5 12h14M5 19.5h9" />
  </Icon>
)

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Icon>
)

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
  </Icon>
)

export const MapIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8 9 4.5z" />
    <path d="M9 4.5v12.7M15 6.8v12.7" />
  </Icon>
)

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.54 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.54a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.46 9v.01a1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03z" />
  </Icon>
)

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Icon>
)

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

/** The three dots that open a menu of actions. */
export const MoreIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Icon>
)

/** The two arrows that stand for the order of a list. */
export const SortIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 4.5v15M7 4.5L4 8M7 4.5l3 3.5" />
    <path d="M14 19.5v-15M14 19.5l-3-3.5M14 19.5l3-3.5" />
  </Icon>
)

/** The funnel that stands for the filters. */
export const FilterIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 5.5h16l-6.2 7.3V19l-3.6-2v-4.2L4 5.5z" />
  </Icon>
)

/** The circle with a tick, for choosing entries. */
export const SelectIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
  </Icon>
)

/** The star that marks the picture which leads an entry. */
export const StarIcon = ({ filled = false, ...props }: IconProps & { filled?: boolean }) => (
  <Icon {...props}>
    <path
      d="M12 4.2l2.35 4.76 5.25.77-3.8 3.7.9 5.23L12 16.44l-4.7 2.47.9-5.23-3.8-3.7 5.25-.77L12 4.2z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Icon>
)

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </Icon>
)

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9.5 5.5L16 12l-6.5 6.5" />
  </Icon>
)

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5.5 9.5L12 16l6.5-6.5" />
  </Icon>
)

export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12.5h10L18 7" />
  </Icon>
)

export const PencilIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20l1-4 11-11 3 3-11 11-4 1z" />
    <path d="M14.5 6.5l3 3" />
  </Icon>
)

export const PinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 3.5h6l-1 6 3.5 3.5H6.5L10 9.5l-1-6z" />
    <path d="M12 13v7.5" />
  </Icon>
)

export const CopyIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </Icon>
)

export const TagIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 11.2V4.8a1.3 1.3 0 0 1 1.3-1.3h6.4a1.3 1.3 0 0 1 .92.38l8 8a1.3 1.3 0 0 1 0 1.84l-6.4 6.4a1.3 1.3 0 0 1-1.84 0l-8-8a1.3 1.3 0 0 1-.38-.92z" />
    <circle cx="8" cy="8" r="1.4" />
  </Icon>
)

export const FolderIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11z" />
  </Icon>
)

export const ImageIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4.5 17l4.5-4.5 3 3 3-3 4.5 4.5" />
  </Icon>
)

export const VideoIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="6" width="12.5" height="12" rx="2.5" />
    <path d="M15.5 10.5l5-3v9l-5-3" />
  </Icon>
)

export const FileIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V3.5z" />
    <path d="M13 3.5V9h5" />
  </Icon>
)

export const LocationIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </Icon>
)

/** The arrow that points at the place the map is centred on. */
export const NavigationIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m20.4 3.6-6.8 16.3a.6.6 0 0 1-1.11.06L9.4 13.2l-6.7-3.6a.6.6 0 0 1 .05-1.12L20.4 3.6Z" />
  </Icon>
)

/** The crosshair that finds the position of the phone. */
export const CrosshairIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="6.5" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </Icon>
)

export const SparkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5z" />
  </Icon>
)

export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15" />
  </Icon>
)

export const UploadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 15.5v-11M7.5 9L12 4.5 16.5 9M4.5 19.5h15" />
  </Icon>
)

export const UndoIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 7.5H15.5a4.5 4.5 0 0 1 0 9H7" />
    <path d="M11.5 4L8 7.5 11.5 11" />
  </Icon>
)

export const RedoIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 7.5H8.5a4.5 4.5 0 0 0 0 9H17" />
    <path d="M12.5 4L16 7.5 12.5 11" />
  </Icon>
)

export const BoldIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 4.5h6.2a3.75 3.75 0 0 1 0 7.5H7zM7 12h7a3.75 3.75 0 0 1 0 7.5H7z" />
  </Icon>
)

export const ItalicIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 4.5h-5M14 19.5H9M13.5 4.5l-4 15" />
  </Icon>
)

export const ListIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  </Icon>
)

export const QuoteIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9.5 6.5C7 8 6 10 6 13.5A2.5 2.5 0 0 0 8.5 16c1.4 0 2.5-1.1 2.5-2.5 0-1.3-1-2.3-2.3-2.3-.3 0-.6 0-.8.1.3-1.6 1.3-3 2.6-4zM18.5 6.5C16 8 15 10 15 13.5a2.5 2.5 0 0 0 2.5 2.5c1.4 0 2.5-1.1 2.5-2.5 0-1.3-1-2.3-2.3-2.3-.3 0-.6 0-.8.1.3-1.6 1.3-3 2.6-4z" />
  </Icon>
)

export const HeadingIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 5v14M15 5v14M5 12h10" />
  </Icon>
)

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
)

export const GlobeIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5z" />
  </Icon>
)

export const PaletteIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.4-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h1.4A4.3 4.3 0 0 0 20.5 10c0-3.6-3.8-6.5-8.5-6.5z" />
    <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="7.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const ShieldIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5l7 2.5v6c0 4-3 7.2-7 8.5-4-1.3-7-4.5-7-8.5V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
)

export const DevicesIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="12" height="9" rx="1.8" />
    <path d="M6.5 17.5h5M9 14v3.5" />
    <rect x="16.5" y="9" width="5" height="10" rx="1.6" />
  </Icon>
)

export const GridIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4" y="4" width="7" height="7" rx="1.6" />
    <rect x="13" y="4" width="7" height="7" rx="1.6" />
    <rect x="4" y="13" width="7" height="7" rx="1.6" />
    <rect x="13" y="13" width="7" height="7" rx="1.6" />
  </Icon>
)

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
)

export const ChartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20h16" />
    <path d="M6.5 20v-5.5M11.5 20V8M16.5 20v-8.5" />
  </Icon>
)

export const CoffeeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 8h12v6a4.5 4.5 0 0 1-4.5 4.5H9A4.5 4.5 0 0 1 4.5 14V8z" />
    <path d="M16.5 9.5h1.5a2.5 2.5 0 0 1 0 5h-1.5" />
    <path d="M3.5 21h14" />
  </Icon>
)
