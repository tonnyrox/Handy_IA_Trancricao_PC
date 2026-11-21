import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type {
  AppSettings as Settings,
  AudioDevice,
  PostProcessApiFormat,
  NvidiaModelOption,
  NvidiaModelCheck,
} from "@/bindings";

interface UseSettingsReturn {
  // State
  settings: Settings | null;
  isLoading: boolean;
  isUpdating: (key: string) => boolean;
  audioDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  audioFeedbackEnabled: boolean;
  postProcessModelOptions: Record<string, string[]>;
  nvidiaTranscriptionModelOptions: NvidiaModelOption[];
  updateChecksLocked: boolean | null;

  // Actions
  updateSetting: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => Promise<void>;
  resetSetting: (key: keyof Settings) => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshAudioDevices: () => Promise<void>;
  refreshOutputDevices: () => Promise<void>;

  // Binding-specific actions
  updateBinding: (id: string, binding: string) => Promise<void>;
  resetBinding: (id: string) => Promise<void>;

  // Convenience getters
  getSetting: <K extends keyof Settings>(key: K) => Settings[K] | undefined;

  // Post-processing helpers
  setPostProcessProvider: (providerId: string) => Promise<void>;
  updatePostProcessBaseUrl: (
    providerId: string,
    baseUrl: string,
  ) => Promise<void>;
  updatePostProcessApiFormat: (
    providerId: string,
    apiFormat: PostProcessApiFormat,
  ) => Promise<void>;
  updatePostProcessApiKey: (
    providerId: string,
    apiKey: string,
  ) => Promise<void>;
  updatePostProcessModel: (providerId: string, model: string) => Promise<void>;
  fetchPostProcessModels: (providerId: string) => Promise<string[]>;
  // Cloud transcription helpers
  updateTranscriptionProvider: (provider: string) => Promise<void>;
  updateNvidiaTranscriptionApiKey: (apiKey: string) => Promise<void>;
  updateNvidiaAsrFunctionId: (functionId: string) => Promise<void>;
  updateNvidiaTranscriptionModel: (model: string) => Promise<void>;
  fetchNvidiaTranscriptionModels: (
    apiKey?: string,
  ) => Promise<NvidiaModelOption[]>;
  checkNvidiaModelsWithAudio: (apiKey: string) => Promise<NvidiaModelCheck[]>;
  testNvidiaTranscription: (apiKey: string, model: string) => Promise<string>;
}

export const useSettings = (): UseSettingsReturn => {
  const store = useSettingsStore();

  // Initialize on first mount
  useEffect(() => {
    if (store.isLoading) {
      store.initialize();
    }
  }, [store.initialize, store.isLoading]);

  return {
    settings: store.settings,
    isLoading: store.isLoading,
    isUpdating: store.isUpdatingKey,
    audioDevices: store.audioDevices,
    outputDevices: store.outputDevices,
    audioFeedbackEnabled: store.settings?.audio_feedback || false,
    postProcessModelOptions: store.postProcessModelOptions,
    nvidiaTranscriptionModelOptions: store.nvidiaTranscriptionModelOptions,
    updateChecksLocked: store.updateChecksLocked,
    updateSetting: store.updateSetting,
    resetSetting: store.resetSetting,
    refreshSettings: store.refreshSettings,
    refreshAudioDevices: store.refreshAudioDevices,
    refreshOutputDevices: store.refreshOutputDevices,
    updateBinding: store.updateBinding,
    resetBinding: store.resetBinding,
    getSetting: store.getSetting,
    setPostProcessProvider: store.setPostProcessProvider,
    updatePostProcessBaseUrl: store.updatePostProcessBaseUrl,
    updatePostProcessApiFormat: store.updatePostProcessApiFormat,
    updatePostProcessApiKey: store.updatePostProcessApiKey,
    updatePostProcessModel: store.updatePostProcessModel,
    fetchPostProcessModels: store.fetchPostProcessModels,
    updateTranscriptionProvider: store.updateTranscriptionProvider,
    updateNvidiaTranscriptionApiKey: store.updateNvidiaTranscriptionApiKey,
    updateNvidiaAsrFunctionId: store.updateNvidiaAsrFunctionId,
    updateNvidiaTranscriptionModel: store.updateNvidiaTranscriptionModel,
    fetchNvidiaTranscriptionModels: store.fetchNvidiaTranscriptionModels,
    checkNvidiaModelsWithAudio: store.checkNvidiaModelsWithAudio,
    testNvidiaTranscription: store.testNvidiaTranscription,
  };
};
