import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Eye, EyeOff, Trash2, Cloud, Monitor } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { commands } from "@/bindings";
import { useModelStore } from "@/stores/modelStore";
import {
  ModelTable,
  Note,
  useModelFilters,
  type TableSection,
} from "@/components/shared/modelTable/ModelTable";
import {
  Button,
  Dropdown,
  Input,
  SettingContainer,
  SettingsGroup,
} from "@/components/ui";
import { useSettings } from "@/hooks/useSettings";
import RetiredModelsNotice from "./RetiredModelsNotice";
import { ModelRow } from "./ModelRow";
import { Legend } from "./Legend";
import { useModelEntries } from "./modelEntries";

/** Past this many models on disk, the rest fold under "Show N more". */
const YOURS_LIMIT = 5;

/** Look for model files added outside Handy: quiet, beside its section's name. */
const Rescan: React.FC = () => {
  const { t } = useTranslation();
  const rescanning = useModelStore((s) => s.isRescanning);
  return (
    <Tooltip text={t("settings.models.rescan.tooltip")}>
      <button
        type="button"
        onClick={() => useModelStore.getState().rescanLocalModels()}
        disabled={rescanning}
        aria-label={t("settings.models.rescan.tooltip")}
        className="ms-[6px] grid size-[22px] cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-wash hover:text-text disabled:cursor-default focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary"
      >
        <RefreshCw
          className={`size-[12px] ${rescanning ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
      </button>
    </Tooltip>
  );
};

interface ModelsSettingsProps {
  /** Where the languages are changed (General). */
  onChangeLanguages?: () => void;
}

/** The Models page: onboarding's model table, filling the window. */
export const ModelsSettings: React.FC<ModelsSettingsProps> = ({
  onChangeLanguages,
}) => {
  const { t } = useTranslation();
  const loading = useModelStore((s) => s.loading);
  const { facts, lists } = useModelEntries();
  const { filters, setFilters, searching, matches } = useModelFilters();
  const [more, setMore] = useState(false);
  const {
    settings,
    isUpdating,
    updateTranscriptionProvider,
    updateNvidiaTranscriptionApiKey,
    updateNvidiaAsrFunctionId,
    updateNvidiaTranscriptionModel,
    fetchNvidiaTranscriptionModels,
    checkNvidiaModelsWithAudio,
    testNvidiaTranscription,
    nvidiaTranscriptionModelOptions,
    setPostProcessProvider,
    updatePostProcessModel,
  } = useSettings();

  // Provedores de IA disponíveis na nuvem para a revisão gramatical.
  // Cada provedor mostra seus próprios modelos (mesmo padrão da aba Local).
  const cloudAiProviders = [
    {
      id: "nvidia",
      label: "NVIDIA",
      hint: "Nemotron — usa a mesma chave da transcrição",
      models: [
        { id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning 30B" },
        { id: "nvidia/nemotron-3.5-bolt-e4b", label: "Nemotron 3.5 Bolt E4B" },
      ],
    },
    {
      id: "groq",
      label: "Groq",
      hint: "GPT-OSS — revisão rápida",
      models: [
        { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
        { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
      ],
    },
  ] as const;

  const activeAiProvider = settings?.post_process_provider_id ?? "groq";
  const activeAiModel = settings?.post_process_models?.[activeAiProvider] ?? "";

  // Guia local da página de IAs: Nuvem primeiro, Local depois.
  const [tab, setTab] = useState<"cloud" | "local">(
    (settings?.transcription_provider as string | undefined) === "nvidia"
      ? "cloud"
      : "local",
  );

  const transcriptionProvider =
    (settings?.transcription_provider as string | undefined) ?? "local";
  const nvidiaApiKey = settings?.transcription_api_keys?.nvidia ?? "";
  const nvidiaModel =
    settings?.nvidia_transcription_model ?? "nvidia/parakeet-1_1b-rnnt-multilingual-asr";
  const nvidiaFunctionId = settings?.nvidia_asr_function_id ?? "";
  const [nvidiaApiKeyDraft, setNVIDIAApiKeyDraft] = useState(nvidiaApiKey);
  const [nvidiaFunctionIdDraft, setNvidiaFunctionIdDraft] = useState(nvidiaFunctionId);
  const [nvidiaModelDraft, setNVIDIAModelDraft] = useState(nvidiaModel);
  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "error">(
    "idle",
  );
  const [testMessage, setTestMessage] = useState("");
  const [applyState, setApplyState] = useState<"idle" | "applying" | "success" | "error">(
    "idle",
  );
  const [applyMessage, setApplyMessage] = useState("");
  const [checkState, setCheckState] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [checkMessage, setCheckMessage] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState(false);

  useEffect(() => {
    setNVIDIAApiKeyDraft(nvidiaApiKey);
  }, [nvidiaApiKey]);

  useEffect(() => {
    setNvidiaFunctionIdDraft(nvidiaFunctionId);
  }, [nvidiaFunctionId]);

  useEffect(() => {
    setNVIDIAModelDraft(nvidiaModel);
  }, [nvidiaModel]);

  useEffect(() => {
    if (transcriptionProvider === "nvidia") {
      void fetchNvidiaTranscriptionModels(nvidiaApiKeyDraft || nvidiaApiKey);
    }
  }, [transcriptionProvider, nvidiaApiKey]);

  useEffect(() => {
    setTestState("idle");
    setTestMessage("");
  }, [nvidiaApiKeyDraft, nvidiaModelDraft, transcriptionProvider]);

  useEffect(() => {
    setApplyState("idle");
    setApplyMessage("");
    setCheckState("idle");
    setCheckMessage("");
  }, [nvidiaApiKeyDraft, nvidiaModelDraft, transcriptionProvider]);

  const nvidiaModelOptions = useMemo(() => {
    const fallback = [
      {
        value: "nvidia/parakeet-1_1b-rnnt-multilingual-asr",
        label: "NVIDIA Parakeet 1.1B Multilingual (PT-BR, áudio, recomendado)",
      },
    ];
    const base =
      nvidiaTranscriptionModelOptions.length > 0
        ? nvidiaTranscriptionModelOptions.map((o) => ({
            value: o.id,
            label: o.label,
          }))
        : fallback;
    const selectedDraft = nvidiaModelDraft || nvidiaModel;
    if (selectedDraft && !base.some((o) => o.value === selectedDraft)) {
      return [
        {
          value: selectedDraft,
          label: `${selectedDraft} (${t("settings.models.transcriptionEngine.nvidia.currentModelOption", { defaultValue: "modelo selecionado" })})`,
        },
        ...base,
      ];
    }
    return base;
  }, [nvidiaTranscriptionModelOptions, nvidiaModel, nvidiaModelDraft, t]);

  const handleNvidiaTest = async () => {
    const apiKeyToUse = nvidiaApiKeyDraft;
    const modelToUse = nvidiaModelDraft || nvidiaModel || "nvidia/parakeet-1_1b-rnnt-multilingual-asr";

    setTestState("testing");
    setTestMessage("");

    try {
      // F1: testar com os valores do rascunho, sem persistir.
      // Só "Aplicar" salva a configuração.
      const message = await testNvidiaTranscription(apiKeyToUse, modelToUse);
      setTestState("success");
      setTestMessage(
        message ||
          t("settings.models.transcriptionEngine.nvidia.test.success", {
            defaultValue: "Configuração verificada com sucesso.",
          }),
      );
      // Nao recarrega o dropdown aqui: isso e papel de "Verificar modelos".
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : t("settings.models.transcriptionEngine.nvidia.test.unknownError", {
                defaultValue: "Falha ao verificar a configuração do NVIDIA.",
              });
      setTestState("error");
      setTestMessage(msg);
    }
  };

  const handleCheckModels = async () => {
    setCheckState("checking");
    setCheckMessage("");
    try {
      const results = await checkNvidiaModelsWithAudio(nvidiaApiKeyDraft.trim() || nvidiaApiKey);
      const ok = results.filter((r) => r.ok);
      const bad = results.length - ok.length;
      setCheckState("done");
      setCheckMessage(
        t("settings.models.transcriptionEngine.nvidia.check.done", {
          defaultValue:
            "Verificação concluída: {{ok}} modelo(s) disponível(is), {{bad}} sem suporte a áudio ocultado(s).",
          ok,
          bad,
        }),
      );
    } catch (error) {
      setCheckState("error");
      setCheckMessage(
        error instanceof Error
          ? error.message
          : t("settings.models.transcriptionEngine.nvidia.check.error", {
              defaultValue: "Falha ao verificar os modelos.",
            }),
      );
    }
  };

  const handleNvidiaApply = async () => {
    const apiKeyToUse = nvidiaApiKeyDraft.trim();
    const functionIdToUse = nvidiaFunctionIdDraft.trim();
    const modelToUse =
      (nvidiaModelDraft || nvidiaModel || "").trim() ||
      "nvidia/parakeet-1_1b-rnnt-multilingual-asr";

    setApplyState("applying");
    setApplyMessage("");

    try {
      if (apiKeyToUse !== nvidiaApiKey) {
        await updateNvidiaTranscriptionApiKey(apiKeyToUse);
      }
      if (functionIdToUse !== nvidiaFunctionId) {
        await updateNvidiaAsrFunctionId(functionIdToUse);
      }
      if (modelToUse !== (settings?.nvidia_transcription_model ?? "")) {
        await updateNvidiaTranscriptionModel(modelToUse);
      }
      if (transcriptionProvider !== "nvidia") {
        await updateTranscriptionProvider("nvidia");
      }

      const clearResult = await commands.clearActiveModel();
      if (clearResult.status === "error") {
        throw new Error(clearResult.error);
      }

      await useModelStore.getState().loadCurrentModel();
      await fetchNvidiaTranscriptionModels(apiKeyToUse);
      setApplyState("success");
      setApplyMessage(
        t("settings.models.transcriptionEngine.nvidia.apply.success", {
          defaultValue: "Modelo NVIDIA aplicado. O modelo local foi desmarcado.",
        }),
      );
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : t("settings.models.transcriptionEngine.nvidia.apply.unknownError", {
                defaultValue: "Falha ao aplicar a configuração do NVIDIA.",
              });
      setApplyState("error");
      setApplyMessage(msg);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl w-full mx-auto">
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-logo-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const keep = (xs: typeof lists.yours) => xs.filter(matches);
  const moreButton = !searching && lists.yours.length > YOURS_LIMIT && (
    <button
      type="button"
      onClick={() => setMore((m) => !m)}
      className="ms-[40px] mt-[2px] flex h-[28px] cursor-pointer items-center gap-[8px] rounded-[7px] px-[2px] text-small font-medium text-ink-2 hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary"
    >
      {more
        ? t("settings.models.showFewer")
        : t("settings.models.showMore", {
            count: lists.yours.length - YOURS_LIMIT,
          })}
      <span
        aria-hidden="true"
        className={`inline-block size-[6px] shrink-0 border-e-[1.5px] border-b-[1.5px] border-current ${more ? "mt-[3px] -rotate-[135deg]" : "-mt-[3px] rotate-45"}`}
      />
    </button>
  );

  // Separação total: nuvem e local nunca se misturam na mesma lista.
  // Com NVIDIA ativo, só o modelo cloud aparece; com Local ativo, só os locais.
  const cloudSection: TableSection = {
    key: "cloud",
    label: t("settings.models.transcriptionEngine.nvidia.cloudSection", {
      defaultValue: "Modelo em uso (NVIDIA Cloud)",
    }),
    rows: lists.cloud,
  };

  const sections: TableSection[] =
    transcriptionProvider === "nvidia"
      ? lists.cloud.length
        ? [cloudSection]
        : []
      : searching
        ? [
            {
              key: "yours",
              label: t("settings.models.sections.yours"),
              rows: keep(lists.yours),
            },
            {
              key: "fits",
              label: t("settings.models.sections.fits"),
              rows: keep(lists.fits),
            },
            {
              key: "partial",
              label: t("modelTable.missingLanguage"),
              rows: keep(lists.partial),
            },
            {
              key: "untested",
              label: t("settings.models.sections.untested"),
              rows: filters.query.trim() ? keep(lists.untested) : [],
              note: t("settings.models.untestedNote"),
            },
          ]
        : [
            {
              key: "yours",
              label: (
                <>
                  {t("settings.models.sections.yours")}
                  <Rescan />
                </>
              ),
              rows: more ? lists.yours : lists.yours.slice(0, YOURS_LIMIT),
              after: lists.yours.length ? (
                moreButton
              ) : (
                <Note>{t("settings.models.emptyYours")}</Note>
              ),
            },
            {
              key: "fits",
              label: t("settings.models.sections.fits"),
              rows: lists.fits,
            },
            {
              key: "partial",
              label: t("modelTable.missingLanguage"),
              rows: lists.partial,
            },
          ];

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
      {/* The title, and across from it where to change the languages the
          grades are for. */}
      <div className="mb-[16px] flex flex-none items-center justify-between gap-[12px] px-[12px]">
        <h1 className="text-xl font-semibold">{t("settings.models.title")}</h1>
        {onChangeLanguages && (
          <button
            type="button"
            onClick={onChangeLanguages}
            className="shrink-0 cursor-pointer text-sm text-text underline decoration-line-strong underline-offset-[3px] hover:decoration-text focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary"
          >
            {t("settings.models.changeLanguages")}
          </button>
        )}
      </div>

      {/* Guias da página de IAs: Nuvem (padrão) e Local. */}
      <div className="mx-[12px] mb-[16px] flex flex-none" role="tablist">
        <div className="inline-flex rounded-lg bg-wash p-1">
          {(["cloud", "local"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary ${
                tab === value
                  ? "bg-background text-text shadow-sm"
                  : "text-mid-gray hover:text-text"
              }`}
            >
              {t(`settings.models.tabs.${value}`, {
                defaultValue: value === "cloud" ? "Nuvem" : "Local",
              })}
            </button>
          ))}
        </div>
      </div>

      {tab === "cloud" && (
      <div className="mb-[16px] flex-none space-y-3 px-[12px]">
        <SettingsGroup
          title={t("settings.models.transcriptionEngine.groupTitle")}
          description={t("settings.models.transcriptionEngine.groupDescription")}
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-text">
              {t("settings.models.transcriptionEngine.provider.title")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "nvidia", Icon: Cloud, label: t("settings.models.transcriptionEngine.provider.options.nvidia"), hint: t("settings.models.transcriptionEngine.provider.cloudHint", { defaultValue: "NVIDIA Cloud — transcrição rápida em PT-BR" }) },
                { value: "local", Icon: Monitor, label: t("settings.models.transcriptionEngine.provider.options.local"), hint: t("settings.models.transcriptionEngine.provider.localHint", { defaultValue: "Transcrição no dispositivo, sem internet" }) },
              ] as const).map(({ Icon, ...opt }) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => void updateTranscriptionProvider(opt.value)}
                  disabled={isUpdating("transcription_provider")}
                  className={`flex flex-col items-start gap-0.5 rounded-lg border p-3 text-start transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary ${
                    transcriptionProvider === opt.value
                      ? "border-logo-primary bg-logo-primary/10"
                      : "border-line bg-background-ui/20 hover:bg-wash"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-text">
                    <Icon size={15} aria-hidden="true" className="text-logo-primary" /> {opt.label}
                  </span>
                  <span className="text-xs text-mid-gray">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Nuvem: primeiro os provedores de IA, depois os modelos de cada um. */}
          <div className="pt-2">
            <p className="mb-2 text-xs font-medium text-text">
              {t("settings.models.transcriptionEngine.nvidia.aiProviders.title", {
                defaultValue: "Provedores de IA na nuvem (revisão gramatical)",
              })}
            </p>
            <div className="space-y-2">
              {/* Provedor primeiro (Dropdown), modelos logo abaixo. */}
              <Dropdown
                options={cloudAiProviders.map((provider) => ({
                  value: provider.id,
                  label: provider.label,
                }))}
                selectedValue={activeAiProvider}
                onSelect={(value) => void setPostProcessProvider(value)}
                disabled={isUpdating("post_process_provider_id")}
              />
              <p className="text-xs text-mid-gray">
                {cloudAiProviders.find((p) => p.id === activeAiProvider)?.hint}
              </p>
              <div className="flex flex-wrap gap-2 border-t border-line pt-2">
                {cloudAiProviders
                  .find((p) => p.id === activeAiProvider)
                  ?.models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => void updatePostProcessModel(activeAiProvider, model.id)}
                      disabled={isUpdating("post_process_model")}
                      className={`rounded-md border px-2 py-1 text-xs cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary ${
                        activeAiModel === model.id
                          ? "border-logo-primary bg-logo-primary/15 text-text"
                          : "border-line text-mid-gray hover:text-text"
                      }`}
                    >
                      {model.label}
                    </button>
                  ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-mid-gray">
              {t("settings.models.transcriptionEngine.nvidia.aiProviders.note", {
                defaultValue:
                  "A transcrição usa NVIDIA Riva; a revisão gramatical usa o provedor e o modelo escolhidos acima.",
              })}
            </p>
          </div>

          {transcriptionProvider === "nvidia" && (
            <>
              <SettingContainer
                title={t("settings.models.transcriptionEngine.nvidia.title")}
                description={t(
                  "settings.models.transcriptionEngine.nvidia.description",
                )}
                descriptionMode="inline"
                grouped
                layout="stacked"
              >
                <div className="space-y-4 pt-1">
                  {/* Layout em etapas: credencial → modelo → ações → resultado. */}
                  <section className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-mid-gray">
                      {t("settings.models.transcriptionEngine.nvidia.stepCredential", {
                        defaultValue: "1 · Credencial NVIDIA",
                      })}
                    </p>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">
                      {t(
                        "settings.models.transcriptionEngine.nvidia.apiKey.label",
                      )}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        value={nvidiaApiKeyDraft}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNVIDIAApiKeyDraft(e.target.value)
                        }
                        placeholder={t(
                          "settings.models.transcriptionEngine.nvidia.apiKey.placeholder",
                        )}
                        disabled={isUpdating("nvidia_transcription_api_key")}
                        className="w-full"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        title={t("settings.models.transcriptionEngine.nvidia.apiKey.showHide", { defaultValue: "Mostrar/Ocultar chave" })}
                        aria-label={t("settings.models.transcriptionEngine.nvidia.apiKey.showHide", { defaultValue: "Mostrar/Ocultar chave" })}
                        className="shrink-0 rounded-md border border-line p-2 text-mid-gray hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary cursor-pointer"
                      >
                        {showApiKey ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveKey(true)}
                        title={t("settings.models.transcriptionEngine.nvidia.apiKey.remove", { defaultValue: "Remover chave" })}
                        aria-label={t("settings.models.transcriptionEngine.nvidia.apiKey.remove", { defaultValue: "Remover chave" })}
                        className="shrink-0 rounded-md border border-line p-2 text-mid-gray hover:text-error focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary cursor-pointer"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                    <p className="text-xs text-mid-gray">
                      {t(
                        "settings.models.transcriptionEngine.nvidia.apiKey.description",
                      )}
                    </p>

                    {confirmRemoveKey && (
                      <div className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-xs">
                        <p className="mb-2 text-text">
                          {t("settings.models.transcriptionEngine.nvidia.apiKey.removeConfirm", {
                            defaultValue: "Remover a chave salva? A transcrição em nuvem para até você colar outra.",
                          })}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setNVIDIAApiKeyDraft("");
                              void updateNvidiaTranscriptionApiKey("").then(() => {
                                setConfirmRemoveKey(false);
                                setApplyState("success");
                                setApplyMessage(
                                  t("settings.models.transcriptionEngine.nvidia.apiKey.removed", {
                                    defaultValue: "Chave removida.",
                                  }),
                                );
                              });
                            }}
                          >
                            {t("common.delete", { defaultValue: "Remover" })}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setConfirmRemoveKey(false)}>
                            {t("settings.models.cancel", { defaultValue: "Cancelar" })}
                          </Button>
                        </div>
                      </div>
                    )}

                    <details className="rounded-md border border-line bg-background-ui/10 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium text-mid-gray">
                        {t("settings.models.transcriptionEngine.nvidia.advanced", {
                          defaultValue: "Avançado (opcional) — Function-ID do modelo",
                        })}
                      </summary>
                      <div className="mt-2 flex flex-col gap-1">
                        <Input
                          type="text"
                          value={nvidiaFunctionIdDraft}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setNvidiaFunctionIdDraft(e.target.value)
                          }
                          placeholder={t(
                            "settings.models.transcriptionEngine.nvidia.functionId.placeholder",
                            { defaultValue: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
                          )}
                          disabled={isUpdating("nvidia_asr_function_id")}
                          className="w-full"
                        />
                        <p className="text-xs text-mid-gray">
                          {t(
                            "settings.models.transcriptionEngine.nvidia.functionId.description",
                            {
                              defaultValue:
                                "ID do modelo de voz ativado na sua conta (build.nvidia.com). Atualize se trocar de chave ou de modelo.",
                            },
                          )}
                        </p>
                      </div>
                    </details>
                  </div>
                  </section>

                  <section className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-mid-gray">
                      {t("settings.models.transcriptionEngine.nvidia.stepModel", {
                        defaultValue: "2 · Modelo de transcrição",
                      })}
                    </p>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">
                      {t(
                        "settings.models.transcriptionEngine.nvidia.model.label",
                      )}
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Dropdown
                        options={nvidiaModelOptions}
                        selectedValue={nvidiaModelDraft || nvidiaModel}
                        onSelect={(value) => {
                          setNVIDIAModelDraft(value);
                        }}
                        disabled={
                          isUpdating("nvidia_transcription_model") ||
                          isUpdating("nvidia_transcription_models_fetch")
                        }
                        className="min-w-[260px] flex-1"
                      />
                      <p className="pt-1 text-[11px] font-medium text-mid-gray">
                        {t("settings.models.transcriptionEngine.nvidia.stepActions", {
                          defaultValue: "Ações",
                        })}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleNvidiaTest()}
                          disabled={
                            testState === "testing" ||
                            applyState === "applying" ||
                            isUpdating("nvidia_transcription_api_key") ||
                            isUpdating("nvidia_transcription_test") ||
                            !(nvidiaModelDraft || nvidiaModel) ||
                            !nvidiaApiKeyDraft.trim()
                          }
                        >
                          {testState === "testing" ||
                          isUpdating("nvidia_transcription_test")
                            ? t(
                                "settings.models.transcriptionEngine.nvidia.test.testing",
                                { defaultValue: "Verificando..." },
                              )
                            : t(
                                "settings.models.transcriptionEngine.nvidia.test.button",
                                { defaultValue: "Verificar configuração" },
                              )}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleCheckModels()}
                          disabled={
                            checkState === "checking" ||
                            applyState === "applying" ||
                            testState === "testing" ||
                            isUpdating("nvidia_models_check") ||
                            !nvidiaApiKeyDraft.trim()
                          }
                        >
                          {checkState === "checking"
                            ? t(
                                "settings.models.transcriptionEngine.nvidia.check.checking",
                                { defaultValue: "Verificando modelos..." },
                              )
                            : t(
                                "settings.models.transcriptionEngine.nvidia.check.button",
                                { defaultValue: "Verificar modelos" },
                              )}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void handleNvidiaApply()}
                          disabled={
                            applyState === "applying" ||
                            testState === "testing" ||
                            isUpdating("nvidia_transcription_api_key") ||
                            isUpdating("nvidia_transcription_model") ||
                            !(nvidiaModelDraft || nvidiaModel) ||
                            !nvidiaApiKeyDraft.trim()
                          }
                        >
                          {applyState === "applying"
                            ? t(
                                "settings.models.transcriptionEngine.nvidia.apply.applying",
                                { defaultValue: "Aplicando..." },
                              )
                            : t(
                                "settings.models.transcriptionEngine.nvidia.apply.button",
                                { defaultValue: "Aplicar" },
                              )}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-mid-gray">
                      {t(
                        "settings.models.transcriptionEngine.nvidia.model.description",
                      )}
                    </p>
                    {/* Status de "Verificar configuração" — próprio do botão de teste */}
                    {testState !== "idle" && testMessage && (
                      <div className={`rounded-md border px-3 py-2 text-xs ${
                        testState === "success"
                          ? "border-moss/40 bg-moss/10 text-text"
                          : testState === "error"
                            ? "border-error/40 bg-error/10 text-text"
                            : "border-line bg-background-ui/10 text-mid-gray"
                      }`}>
                        <span className="font-medium">
                          {t("settings.models.transcriptionEngine.nvidia.test.statusLabel", {
                            defaultValue: "Verificar configuração:",
                          })}
                        </span>{" "}
                        {testMessage}
                      </div>
                    )}
                    {/* Status de "Verificar modelos" — próprio do botão de modelos */}
                    {checkState !== "idle" && checkMessage && (
                      <div className={`rounded-md border px-3 py-2 text-xs ${
                        checkState === "done"
                          ? "border-moss/40 bg-moss/10 text-text"
                          : checkState === "error"
                            ? "border-error/40 bg-error/10 text-text"
                            : "border-line bg-background-ui/10 text-mid-gray"
                      }`}>
                        <span className="font-medium">
                          {t("settings.models.transcriptionEngine.nvidia.check.statusLabel", {
                            defaultValue: "Verificar modelos:",
                          })}
                        </span>{" "}
                        {checkMessage}
                      </div>
                    )}
                    {/* Status de "Aplicar" */}
                    {applyState !== "idle" && applyMessage && (
                      <div className={`rounded-md border px-3 py-2 text-xs ${
                        applyState === "success"
                          ? "border-moss/40 bg-moss/10 text-text"
                          : applyState === "error"
                            ? "border-error/40 bg-error/10 text-text"
                            : "border-line bg-background-ui/10 text-mid-gray"
                      }`}>
                        <span className="font-medium">
                          {t("settings.models.transcriptionEngine.nvidia.apply.statusLabel", {
                            defaultValue: "Aplicar:",
                          })}
                        </span>{" "}
                        {applyMessage}
                      </div>
                    )}
                    {!nvidiaApiKeyDraft.trim() && (
                      <p className="text-xs text-mid-gray">
                        {t(
                          "settings.models.transcriptionEngine.nvidia.test.needsKey",
                          {
                            defaultValue:
                              "Informe a chave da NVIDIA para carregar modelos e verificar a configuração.",
                          },
                        )}
                      </p>
                    )}
                  </div>
                  </section>

                </div>
              </SettingContainer>
            </>
          )}
        </SettingsGroup>
      </div>
      )}

      {tab === "local" && (
      <>
      <div className="mx-[12px] mb-[16px] flex-none empty:hidden">
        <RetiredModelsNotice />
      </div>
      <ModelTable
        grading={facts}
        filters={filters}
        setFilters={setFilters}
        // "Yours" always shows at rest; a search hides empty sections.
        sections={sections.filter(
          (s) => s.rows.length || (s.key === "yours" && !searching),
        )}
        renderRow={(e) => <ModelRow key={e.id} entry={e} />}
        actionsHead={<Legend tier={facts.tier} />}
        footer={
          !searching &&
          lists.untested.length > 0 && (
            <Note>
              {t("settings.models.untestedHidden", {
                count: lists.untested.length,
              })}
            </Note>
          )
        }
        thinEdge
      />
      </>
      )}
    </div>
  );
};
