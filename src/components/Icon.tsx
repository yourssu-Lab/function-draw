export default function Icon({
  name,
  size = 18,
}: {
  name: string;
  size?: number;
}) {
  const paths: Record<string, React.ReactNode> = {
    select: <path d="m5 3 13 9-7 1-3 7z" />,
    pen: (
      <>
        <path d="m4 20 1-6L16 3l5 5L10 19zM14 5l5 5M5 14l5 5" />
      </>
    ),
    line: (
      <>
        <path d="M5 19 19 5" />
        <circle cx="5" cy="19" r="1.5" />
        <circle cx="19" cy="5" r="1.5" />
      </>
    ),
    circle: <circle cx="12" cy="12" r="8" />,
    box: <rect x="4" y="4" width="16" height="16" rx="1" />,
    eraser: (
      <>
        <path d="m4 13 9-9 8 8-9 9H9l-5-5zM9 8l8 8M12 21h9" />
      </>
    ),
    undo: <path d="M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7v2" />,
    redo: <path d="m16 5 5 5-5 5M21 10H11a7 7 0 0 0-7 7v2" />,
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    left: <path d="M20 12H4m6-6-6 6 6 6" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M15 8V3H3v13h5" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    book: (
      <>
        <path d="M12 5v16M12 5C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 1Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    grid: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.info}
    </svg>
  );
}
