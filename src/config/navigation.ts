export type AppRoutePath = "/" | "/attendance" | "/network";

export interface AppNavigationItem {
  label: string;
  path: AppRoutePath;
  title: string;
}

export const appNavigation: AppNavigationItem[] = [
  { label: "Dashboard", path: "/", title: "Overview" },
  {
    label: "Attendance Analytics",
    path: "/attendance",
    title: "Attendance Analytics",
  },
  { label: "Network Usage", path: "/network", title: "Network Usage" },
];

export const pageTitles: Record<AppRoutePath, string> = appNavigation.reduce(
  (accumulator, item) => {
    accumulator[item.path] = item.title;
    return accumulator;
  },
  {} as Record<AppRoutePath, string>,
);
