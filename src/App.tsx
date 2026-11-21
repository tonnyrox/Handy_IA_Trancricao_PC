import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./App.css";
import SecureInputWarning from "./components/SecureInputWarning";
import Footer from "./components/footer";
import { DebugSettings, ModelsSettings } from "./components/settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FileDropOverlay } from "./components/FileDropOverlay";
import { Sidebar, SidebarSection, SECTIONS_CONFIG } from "./components/Sidebar";
import { WhatsNewGate } from "./components/whats-new";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { commands } from "@/bindings";
import { NoticePanel } from "@/components/notices/NoticePanel";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";

const renderSettingsContent = (
  section: SidebarSection,
  onSectionChange: (section: SidebarSection) => void,
) => {
  if (section === "models") {
    return <ModelsSettings onChangeLanguages={() => onSectionChange("general")} />;
  }
  if (section === "debug") {
    return <DebugSettings />;
  }

  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component || SECTIONS_CONFIG.general.component;
  return <ActiveComponent />;
};

function App() {
  const { i18n } = useTranslation();
  const [currentSection, setCurrentSection] = useState<SidebarSection>("general");
  const showHistory = useCallback(() => setCurrentSection("history"), []);
  const { settings, updateSetting } = useSettings();
  const direction = getLanguageDirection(i18n.language);
  const refreshAudioDevices = useSettingsStore((state) => state.refreshAudioDevices);
  const refreshOutputDevices = useSettingsStore((state) => state.refreshOutputDevices);
  const hasCompletedPostInit = useRef(false);
  const settingsScrollRef = useRef<HTMLDivElement>(null);

  // Reset the scroll position whenever the active section changes.
  useLayoutEffect(() => {
    settingsScrollRef.current?.scrollTo({ top: 0 });
  }, [currentSection]);

  // Initialize RTL direction when language changes
  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

  // Initialize app services and refresh devices once on startup.
  useEffect(() => {
    if (hasCompletedPostInit.current) return;
    hasCompletedPostInit.current = true;

    void Promise.all([
      commands.initializeEnigo(),
      commands.initializeShortcuts(),
    ]).catch((e) => {
      console.warn("Failed to initialize:", e);
    });
    void refreshAudioDevices();
    void refreshOutputDevices();
  }, [refreshAudioDevices, refreshOutputDevices]);

  // Handle keyboard shortcuts for debug mode toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isDebugShortcut =
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        (event.ctrlKey || event.metaKey);

      if (isDebugShortcut) {
        event.preventDefault();
        const currentDebugMode = settings?.debug_mode ?? false;
        void updateSetting("debug_mode", !currentDebugMode);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings?.debug_mode, updateSetting]);

  return (
    <>
      <div
        dir={direction}
        className="h-screen flex flex-col select-none cursor-default"
      >
        <ErrorBoundary context="What's New">
          <WhatsNewGate />
        </ErrorBoundary>
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            activeSection={currentSection}
            onSectionChange={setCurrentSection}
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            <div ref={settingsScrollRef} className="flex-1 overflow-y-auto">
              <div
                className={`flex flex-col items-center p-4 gap-4 ${currentSection === "models" ? "min-h-full" : ""}`}
              >
                <SecureInputWarning />
                {renderSettingsContent(currentSection, setCurrentSection)}
              </div>
            </div>
          </div>
        </div>
        <Footer onShowHistory={showHistory} />
        <FileDropOverlay onDropped={showHistory} />
      </div>
      <NoticePanel />
    </>
  );
}

export default App;
