import { saveSettingsDebounced } from "../../../../../../script.js";
import { getContext } from '../../../../../../scripts/extensions.js';

import { extensionFolderPath, extensionSettings } from "../../index.js";
import { error, debug, toTitleCase } from "../../lib/utils.js";
import { defaultSettings, generationModes, generationTargets } from "./defaultSettings.js";
import { generationCaptured } from "../../lib/interconnection.js";
import { TrackerPromptMakerModal } from "../ui/trackerPromptMakerModal.js";
import { setDockTemplatePreview, clearDockTemplatePreview } from "../ui/dockedTrackerPanel.js";

export { generationModes, generationTargets, trackerFormat } from "./defaultSettings.js";

/**
 * Checks if the extension is enabled.
 * @returns {Promise<boolean>} True if enabled, false otherwise.
 */
export async function isEnabled() {
	debug("Checking if extension is enabled:", extensionSettings.enabled);
	return extensionSettings.enabled && (await generationCaptured());
}

export async function toggleExtension(enable = true) {
	extensionSettings.enabled = enable;
	$("#tracker_enable").prop("checked", enable);
	saveSettingsDebounced();
}


// #region Settings Initialization

/**
 * Initializes the extension settings.
 * If certain settings are missing, uses default settings.
 * Saves the settings and loads the settings UI.
 */
export async function initSettings() {
	const currentSettings = { ...extensionSettings };

	if (!currentSettings.trackerDef) {
		const allowedKeys = [
			"enabled",
			"generateContextTemplate",
			"generateSystemPrompt",
			"generateRequestPrompt",
			"characterDescriptionTemplate",
			"mesTrackerTemplate",
			"dockTemplateEnabled",
			"dockTemplateHtml",
			"dockTemplateCss",
			"dockTemplateJs",
			"dockTemplatePresets",
			"selectedDockTemplatePreset",
			"settingsPanelColor",
			"settingsPanelOpacity",
			"numberOfMessages",
			"responseLength",
			"debugMode",
		];

		const newSettings = {
			...defaultSettings,
			...Object.fromEntries(allowedKeys.map((key) => [key, currentSettings[key] || defaultSettings[key]])),
			oldSettings: currentSettings,
		};

		for (const key in extensionSettings) {
			if (!(key in newSettings)) {
				delete extensionSettings[key];
			}
		}

		Object.assign(extensionSettings, newSettings);
	} else {
		migrateIsDynamicToPresence(extensionSettings);

		Object.assign(extensionSettings, defaultSettings, currentSettings);
	}

	saveSettingsDebounced();

	await loadSettingsUI();
}

/**
 * Migrates the isDynamic field to presence for all objects in the settings.
 * @param {Object} obj The object to migrate.
 * @returns {void}
*/
function migrateIsDynamicToPresence(obj) {
	if (typeof obj !== "object" || obj === null) return;

	for (const key in obj) {
		if (key === "isDynamic") {
			// Replace isDynamic with presence, mapping true → "DYNAMIC" and false → "STATIC"
			obj.presence = obj[key] ? "DYNAMIC" : "STATIC";
			delete obj.isDynamic; // Remove old key
		} else if (typeof obj[key] === "object") {
			// Recursively migrate nested objects
			migrateIsDynamicToPresence(obj[key]);
		}
	}
}

/**
 * Loads the settings UI by fetching the HTML and appending it to the page.
 * Sets initial values and registers event listeners.
 */
async function loadSettingsUI() {
	console.log('[TrackerRevamp] loadSettingsUI called');

	const settingsHtml = await $.get(`${extensionFolderPath}/html/settings.html`);
	$("#extensions_settings2").append(settingsHtml);

	try {
  console.log('[TrackerRevamp] calling setSettingsInitialValues');
  setSettingsInitialValues();
} catch (e) {
  console.error('setSettingsInitialValues failed', e);
}

try {
  console.log('[TrackerRevamp] calling registerSettingsListeners');
  registerSettingsListeners();
} catch (e) {
  console.error('registerSettingsListeners failed', e);
}

try {
  console.log('[TrackerRevamp] calling updateFieldVisibility');
  updateFieldVisibility(extensionSettings.generationMode);
} catch (e) {
  console.error('updateFieldVisibility failed', e);
}

}

/**
 * Sets the initial values for the settings UI elements based on current settings.
 */
function setSettingsInitialValues() {
	// Populate presets dropdown
	updatePresetDropdown();
	updateDockTemplatePresetDropdown();
	initializeOverridesDropdowns();
	updatePopupDropdown();
	updateFieldVisibility(extensionSettings.generationMode);

	$("#tracker_enable").prop("checked", extensionSettings.enabled);
	$("#tracker_generation_mode").val(extensionSettings.generationMode);
	$("#tracker_generation_target").val(extensionSettings.generationTarget);
	$("#tracker_show_popup_for").val(extensionSettings.showPopupFor);
	$("#tracker_format").val(extensionSettings.trackerFormat);
	$("#tracker_debug").prop("checked", extensionSettings.debugMode);

	// Set other settings fields
	$("#tracker_context_prompt").val(extensionSettings.generateContextTemplate);
	$("#tracker_system_prompt").val(extensionSettings.generateSystemPrompt);
	$("#tracker_request_prompt").val(extensionSettings.generateRequestPrompt);
	$("#tracker_recent_messages").val(extensionSettings.generateRecentMessagesTemplate);
	$("#tracker_inline_request_prompt").val(extensionSettings.inlineRequestPrompt);
	$("#tracker_message_summarization_context_template").val(extensionSettings.messageSummarizationContextTemplate);
	$("#tracker_message_summarization_system_prompt").val(extensionSettings.messageSummarizationSystemPrompt);
	$("#tracker_message_summarization_request_prompt").val(extensionSettings.messageSummarizationRequestPrompt);
	$("#tracker_message_summarization_recent_messages").val(extensionSettings.messageSummarizationRecentMessagesTemplate);
	$("#tracker_character_description").val(extensionSettings.characterDescriptionTemplate);
	$("#tracker_mes_tracker_template").val(extensionSettings.mesTrackerTemplate);
	$("#tracker_mes_tracker_javascript").val(extensionSettings.mesTrackerJavascript);
	$("#tracker_dock_template_enabled").prop("checked", extensionSettings.dockTemplateEnabled);
	$("#tracker_dock_template_html").val(extensionSettings.dockTemplateHtml);
	$("#tracker_dock_template_css").val(extensionSettings.dockTemplateCss);
	$("#tracker_dock_template_js").val(extensionSettings.dockTemplateJs);
	$("#tracker_dock_template_preset_select").val(extensionSettings.selectedDockTemplatePreset);
	$("#tracker_settings_panel_color").val(extensionSettings.settingsPanelColor);
	$("#tracker_settings_panel_opacity").val(extensionSettings.settingsPanelOpacity);
	$("#tracker_dock_template_color").val("#000000");
	$("#tracker_dock_template_opacity").val(100);
	$("#tracker_number_of_messages").val(extensionSettings.numberOfMessages);
	$("#tracker_generate_from_message").val(extensionSettings.generateFromMessage);
	$("#tracker_minimum_depth").val(extensionSettings.minimumDepth);
	$("#tracker_response_length").val(extensionSettings.responseLength);

	// Process the tracker javascript
	processTrackerJavascript();
	buildDockTemplateMacroList();
	applySettingsPanelTheme();
	updateDockTemplateColorPreview();
}

// #endregion

// #region Event Listeners

/**
 * Registers event listeners for settings UI elements.
 */
function registerSettingsListeners() {
	// Preset management
	$("#tracker_preset_select").on("change", onPresetSelectChange);
	$("#tracker_connection_profile").on("change", onConnectionProfileSelectChange);
	$("#tracker_completion_preset").on("change", onCompletionPresetSelectChange);
	$("#tracker_preset_new").on("click", onPresetNewClick);
	$("#tracker_preset_save").on("click", onPresetSaveClick);
	$("#tracker_preset_rename").on("click", onPresetRenameClick);
	$("#tracker_preset_restore").on("click", onPresetRestoreClick);
	$("#tracker_preset_delete").on("click", onPresetDeleteClick);
	$("#tracker_preset_export").on("click", onPresetExportClick);
	$("#tracker_preset_import_button").on("click", onPresetImportButtonClick);
	$("#tracker_preset_import").on("change", onPresetImportChange);

	// Settings fields
	$("#tracker_enable").on("input", onSettingCheckboxInput("enabled"));
	$("#tracker_generation_mode").on("change", onGenerationModeChange);
	$("#tracker_generation_target").on("change", onSettingSelectChange("generationTarget"));
	$("#tracker_show_popup_for").on("change", onSettingSelectChange("showPopupFor"));
	$("#tracker_format").on("change", onSettingSelectChange("trackerFormat"));
	$("#tracker_debug").on("input", onSettingCheckboxInput("debugMode"));

	$("#tracker_context_prompt").on("input", onSettingInputareaInput("generateContextTemplate"));
	$("#tracker_system_prompt").on("input", onSettingInputareaInput("generateSystemPrompt"));
	$("#tracker_request_prompt").on("input", onSettingInputareaInput("generateRequestPrompt"));
	$("#tracker_recent_messages").on("input", onSettingInputareaInput("generateRecentMessagesTemplate"));
	$("#tracker_inline_request_prompt").on("input", onSettingInputareaInput("inlineRequestPrompt"));
	$("#tracker_message_summarization_context_template").on("input", onSettingInputareaInput("messageSummarizationContextTemplate"));
	$("#tracker_message_summarization_system_prompt").on("input", onSettingInputareaInput("messageSummarizationSystemPrompt"));
	$("#tracker_message_summarization_request_prompt").on("input", onSettingInputareaInput("messageSummarizationRequestPrompt"));
	$("#tracker_message_summarization_recent_messages").on("input", onSettingInputareaInput("messageSummarizationRecentMessagesTemplate"));
	$("#tracker_character_description").on("input", onSettingInputareaInput("characterDescriptionTemplate"));
	$("#tracker_mes_tracker_template").on("input", onSettingInputareaInput("mesTrackerTemplate"));
	$("#tracker_mes_tracker_javascript").on("input", onSettingInputareaInput("mesTrackerJavascript"));
	$("#tracker_dock_template_preset_select").on("change", onDockTemplatePresetSelectChange);
	$("#tracker_dock_template_preset_new").on("click", onDockTemplatePresetNewClick);
	$("#tracker_dock_template_preset_save").on("click", onDockTemplatePresetSaveClick);
	$("#tracker_dock_template_preset_rename").on("click", onDockTemplatePresetRenameClick);
	$("#tracker_dock_template_preset_delete").on("click", onDockTemplatePresetDeleteClick);
	$("#tracker_dock_template_enabled").on("change", onDockTemplateSettingsChange);
	$("#tracker_dock_template_html").on("input", onDockTemplateSettingsChange);
	$("#tracker_dock_template_css").on("input", onDockTemplateSettingsChange);
	$("#tracker_dock_template_js").on("input", onDockTemplateSettingsChange);
	$("#tracker_number_of_messages").on("input", onSettingNumberInput("numberOfMessages"));
	$("#tracker_generate_from_message").on("input", onSettingNumberInput("generateFromMessage"));
	$("#tracker_minimum_depth").on("input", onSettingNumberInput("minimumDepth"));
	$("#tracker_response_length").on("input", onSettingNumberInput("responseLength"));

	$("#tracker_prompt_maker").on("click", onTrackerPromptMakerClick);
	$("#tracker_reset_presets").on("click", onTrackerPromptResetClick);
	$("#tracker_dock_template_save").on("click", onDockTemplateSaveClick);
	$("#tracker_dock_template_cancel").on("click", onDockTemplateCancelClick);
	$("#tracker_dock_template_import_preset").on("click", () => $("#tracker_dock_template_import_files").click());
	$("#tracker_dock_template_export_preset").on("click", exportDockTemplateFiles);
	$("#tracker_dock_template_import_files").on("change", onDockTemplateImportFilesChange);
	$("#tracker_dock_template_open_editor").on("click", openDockTemplateEditor);
	$("#tracker_dock_template_close_editor").on("click", closeDockTemplateEditor);
	$("#tracker_dock_template_macro_group").on("change", buildDockTemplateMacroList);
	$("#tracker_dock_template_color").on("input", updateDockTemplateColorPreview);
	$("#tracker_dock_template_opacity").on("input", updateDockTemplateColorPreview);
	$("#tracker_dock_template_insert_color").on("click", insertDockTemplateColor);

	$("#tracker_settings_panel_color").on("input", onSettingsPanelThemeChange);
	$("#tracker_settings_panel_opacity").on("input", onSettingsPanelThemeChange);
	$(window).on("resize", positionDockTemplateModal);
	$(document).on("scroll", positionDockTemplateModal);
	$("#tracker_dock_template_html_undo").on("click", () => runDockTemplateEditorCommand("tracker_dock_template_html", "undo"));
	$("#tracker_dock_template_html_redo").on("click", () => runDockTemplateEditorCommand("tracker_dock_template_html", "redo"));
	$("#tracker_dock_template_css_undo").on("click", () => runDockTemplateEditorCommand("tracker_dock_template_css", "undo"));
	$("#tracker_dock_template_css_redo").on("click", () => runDockTemplateEditorCommand("tracker_dock_template_css", "redo"));
	$("#tracker_dock_template_js_undo").on("click", () => runDockTemplateEditorCommand("tracker_dock_template_js", "undo"));
	$("#tracker_dock_template_js_redo").on("click", () => runDockTemplateEditorCommand("tracker_dock_template_js", "redo"));

	$("#tracker_dock_template_html, #tracker_dock_template_css, #tracker_dock_template_js").on("focus", function () {
		dockTemplateActiveTextarea = this;
	});

	$("#tracker_dock_template_html, #tracker_dock_template_css, #tracker_dock_template_js").on("keydown", function (e) {
		const isCtrl = e.ctrlKey || e.metaKey;
		if (isCtrl && e.shiftKey && e.key.toLowerCase() === "z") {
			e.preventDefault();
			runDockTemplateEditorCommand(this.id, "redo");
		}
	});

	const {
		eventSource,
		event_types,
	} = getContext();

	eventSource.on(event_types.CONNECTION_PROFILE_LOADED, onMainSettingsConnectionProfileChange);
}

// #endregion

// #region Connection Profile Override

function getConnectionProfiles() {
	const ctx = getContext();
	const connectionProfileNames = ctx.extensionSettings.connectionManager.profiles.map(x => x.name);
	return connectionProfileNames;
}

function updateConnectionProfileDropdown() {
	const connectionProfileSelect = $("#tracker_connection_profile");
	const connectionProfiles = getConnectionProfiles();
	debug("connections profiles found", connectionProfiles);
	connectionProfileSelect.empty();
	connectionProfileSelect.append($("<option>").val("current").text("Same as current"));
	for (const profileName of connectionProfiles) {
		const option = $("<option>").val(profileName).text(profileName);

		if (profileName === extensionSettings.selectedProfile) {
			option.attr("selected", "selected");
		}

		connectionProfileSelect.append(option);
	}
}

function initializeOverridesDropdowns() {
	try {
		const ctx = getContext();
		const connectionManager = ctx.extensionSettings.connectionManager;
		if(connectionManager.profiles.length === 0 && extensionSettings.enabled) {
			return;
		}
		updateConnectionProfileDropdown();
	
		let actualSelectedProfile;
		if(extensionSettings.selectedProfile === 'current') {
			actualSelectedProfile = connectionManager.profiles.find(x => x.id === connectionManager.selectedProfile);
			extensionSettings.selectedProfileApi = actualSelectedProfile.api;
			extensionSettings.selectedProfileMode = actualSelectedProfile.mode;
	
		} else {
			actualSelectedProfile = connectionManager.profiles.find(x => x.name === extensionSettings.selectedProfile);
			extensionSettings.selectedProfileApi = actualSelectedProfile.api;
			extensionSettings.selectedProfileMode = actualSelectedProfile.mode;
			}
		debug("Selected profile:", { actualSelectedProfile, extensionSettings });
		updateCompletionPresetsDropdown();
	} catch(e) {
		error(e)
		toastr.error('Failed to initialize overrides presets');

	}
	saveSettingsDebounced();
}

function onConnectionProfileSelectChange() {
	const selectedProfile = $(this).val();
	extensionSettings.selectedProfile = selectedProfile;
	const ctx = getContext();
	const connectionManager = ctx.extensionSettings.connectionManager

	let actualSelectedProfile;

	if(selectedProfile === 'current') {
		actualSelectedProfile = connectionManager.profiles.find(x => x.id === connectionManager.selectedProfile);
		extensionSettings.selectedProfileApi = actualSelectedProfile.api;
		extensionSettings.selectedProfileMode = actualSelectedProfile.mode;
	} else {
		actualSelectedProfile = connectionManager.profiles.find(x => x.name === selectedProfile);
		extensionSettings.selectedProfileApi = actualSelectedProfile.api;
		extensionSettings.selectedProfileMode = actualSelectedProfile.mode;
	}

	extensionSettings.selectedCompletionPreset = "current";

	debug("Selected profile:", { selectedProfile, extensionSettings });
	updateCompletionPresetsDropdown();
	saveSettingsDebounced();
}

function onMainSettingsConnectionProfileChange() {
	if(extensionSettings.selectedProfile === "current") {
		debug("Connection profile changed. Updating presets drop down");
		extensionSettings.selectedCompletionPreset = "current";
		updateCompletionPresetsDropdown();
	}
}

// #endregion

// #region Completion Preset Override

function getCompletionPresets() {
	const ctx = getContext();
	let validPresetNames = [];

	if(extensionSettings.selectedProfileMode === "cc") {
		const presetManager = ctx.getPresetManager('openai');
		const presets = presetManager.getPresetList().presets;
		const presetNames = presetManager.getPresetList().preset_names;

		let presetsDict = {};
		for(const x in presetNames) presetsDict[x] = presets[presetNames[x]];
		debug('available presetNames', presetNames);
		debug('extensionSettings.selectedProfileApi', extensionSettings.selectedProfileApi);
		debug('presetsDict', presetsDict);
		for(const x in presetsDict) {
			if(presetsDict[x].chat_completion_source === extensionSettings.selectedProfileApi) {
				validPresetNames.push(x);
			}
			else if (presetsDict[x].chat_completion_source === ctx.CONNECT_API_MAP[extensionSettings.selectedProfileApi]?.source) {
				validPresetNames.push(x)
			}
		}
		debug('validPresetNames', validPresetNames);
	} else {
		const presetManager = ctx.getPresetManager('textgenerationwebui');
		const presetNames = presetManager.getPresetList().preset_names;

		validPresetNames = presetNames;
		if (Array.isArray(presetNames)) validPresetNames = presetNames;
		else validPresetNames = Object.keys(validPresetNames);
	}

	return validPresetNames;
}

function updateCompletionPresetsDropdown() {
	const completionPresetsSelect = $("#tracker_completion_preset");
	const completionPresets = getCompletionPresets();
	debug("completion presets found", completionPresets);
	completionPresetsSelect.empty();
	completionPresetsSelect.append($("<option>").val("current").text("Use connection profile Default"));
	for (const presetName of completionPresets) {
		const option = $("<option>").val(presetName).text(presetName);

		if (presetName === extensionSettings.selectedCompletionPreset) {
			option.attr("selected", "selected");
		}

		completionPresetsSelect.append(option);
	}
}

function onCompletionPresetSelectChange() {
	const selectedCompletionPreset = $(this).val();
	extensionSettings.selectedCompletionPreset = selectedCompletionPreset;

	debug("Selected completion preset:", { selectedCompletionPreset, extensionSettings });

	setSettingsInitialValues();
	clearDockTemplatePreview();
	saveSettingsDebounced();
}

// #endregion

// #region Preset Management

/**
 * Updates the presets dropdown with the available presets.
 */
function updatePresetDropdown() {
	const presetSelect = $("#tracker_preset_select");
	presetSelect.empty();
	for (const presetName in extensionSettings.presets) {
		const option = $("<option>").val(presetName).text(presetName);
		if (presetName === extensionSettings.selectedPreset) {
			option.attr("selected", "selected");
		}
		presetSelect.append(option);
	}
}

/**
 * Event handler for changing the selected preset.
 */
function onPresetSelectChange() {
	const selectedPreset = $(this).val();
	extensionSettings.selectedPreset = selectedPreset;
	const presetSettings = extensionSettings.presets[selectedPreset];

	// Update settings with preset settings
	Object.assign(extensionSettings, presetSettings);
	debug("Selected preset:", { selectedPreset, presetSettings, extensionSettings });

	setSettingsInitialValues();
	saveSettingsDebounced();
}

function updateDockTemplatePresetDropdown() {
	const presetSelect = $("#tracker_dock_template_preset_select");
	if (!presetSelect.length) return;

	presetSelect.empty();
	const presets = extensionSettings.dockTemplatePresets || {};
	for (const presetName in presets) {
		const option = $("<option>").val(presetName).text(presetName);
		if (presetName === extensionSettings.selectedDockTemplatePreset) {
			option.attr("selected", "selected");
		}
		presetSelect.append(option);
	}
}

function onDockTemplatePresetSelectChange() {
	const selectedPreset = $(this).val();
	const preset = extensionSettings.dockTemplatePresets?.[selectedPreset];
	if (!preset) return;

	extensionSettings.selectedDockTemplatePreset = selectedPreset;
	extensionSettings.dockTemplateHtml = preset.html ?? "";
	extensionSettings.dockTemplateCss = preset.css ?? "";
	extensionSettings.dockTemplateJs = preset.js ?? "";
	saveSettingsDebounced();
	setSettingsInitialValues();
	applyDockTemplatePreviewFromUI();
}

function onDockTemplatePresetNewClick() {
	const presetName = prompt("Enter a name for the new dock template preset:");
	if (presetName && !extensionSettings.dockTemplatePresets?.[presetName]) {
		const draft = getDockTemplateDraftFromUI();
		if (!extensionSettings.dockTemplatePresets) extensionSettings.dockTemplatePresets = {};
		extensionSettings.dockTemplatePresets[presetName] = {
			enabled: draft.enabled,
			html: draft.html,
			css: draft.css,
			js: draft.js,
		};
		extensionSettings.selectedDockTemplatePreset = presetName;
		updateDockTemplatePresetDropdown();
		saveSettingsDebounced();
		toastr.success(`Dock template preset ${presetName} created.`);
	} else if (extensionSettings.dockTemplatePresets?.[presetName]) {
		alert("A dock template preset with that name already exists.");
	}
}

function onDockTemplatePresetSaveClick() {
	const presetName = extensionSettings.selectedDockTemplatePreset;
	if (!presetName) return;

	const draft = getDockTemplateDraftFromUI();
	if (!extensionSettings.dockTemplatePresets) extensionSettings.dockTemplatePresets = {};
	extensionSettings.dockTemplatePresets[presetName] = {
		enabled: draft.enabled,
		html: draft.html,
		css: draft.css,
		js: draft.js,
	};
	saveSettingsDebounced();
	toastr.success(`Dock template preset ${presetName} saved.`);
}

function onDockTemplatePresetRenameClick() {
	const oldName = $("#tracker_dock_template_preset_select").val();
	const newName = prompt("Enter the new name for the dock template preset:", oldName);
	if (newName && !extensionSettings.dockTemplatePresets?.[newName]) {
		extensionSettings.dockTemplatePresets[newName] = extensionSettings.dockTemplatePresets[oldName];
		delete extensionSettings.dockTemplatePresets[oldName];
		if (extensionSettings.selectedDockTemplatePreset === oldName) {
			extensionSettings.selectedDockTemplatePreset = newName;
		}
		updateDockTemplatePresetDropdown();
		saveSettingsDebounced();
		toastr.success(`Dock template preset ${oldName} renamed to ${newName}.`);
	} else if (extensionSettings.dockTemplatePresets?.[newName]) {
		alert("A dock template preset with that name already exists.");
	}
}

function onDockTemplatePresetDeleteClick() {
	const presetName = $("#tracker_dock_template_preset_select").val();
	if (!presetName) return;
	if (confirm(`Are you sure you want to delete the dock template preset "${presetName}"?`)) {
		delete extensionSettings.dockTemplatePresets[presetName];
		const remaining = Object.keys(extensionSettings.dockTemplatePresets);
		if (!remaining.length) {
			extensionSettings.dockTemplatePresets = {
				"Default": {
					enabled: false,
					html: "",
					css: "",
					js: "",
				},
			};
			extensionSettings.selectedDockTemplatePreset = "Default";
			updateDockTemplatePresetDropdown();
			onDockTemplatePresetSelectChange.call($("#tracker_dock_template_preset_select"));
		} else {
			extensionSettings.selectedDockTemplatePreset = remaining[0];
			updateDockTemplatePresetDropdown();
			onDockTemplatePresetSelectChange.call($("#tracker_dock_template_preset_select"));
		}
		saveSettingsDebounced();
		toastr.success(`Dock template preset ${presetName} deleted.`);
	}
}

/**
 * Event handler for creating a new preset.
 */
function onPresetNewClick() {
	const presetName = prompt("Enter a name for the new preset:");
	if (presetName && !extensionSettings.presets[presetName]) {
		const newPreset = getCurrentPresetSettings();
		extensionSettings.presets[presetName] = newPreset;
		extensionSettings.selectedPreset = presetName;
		updatePresetDropdown();
		saveSettingsDebounced();
		toastr.success(`Tracker preset ${presetName} created.`);
	} else if (extensionSettings.presets[presetName]) {
		alert("A preset with that name already exists.");
	}
}

/**
 * Event handler for creating a new preset.
 */
function onPresetSaveClick() {
	const presetName = extensionSettings.selectedPreset;

	const updatedPreset = getCurrentPresetSettings();
	extensionSettings.presets[presetName] = updatedPreset;
	saveSettingsDebounced();
	toastr.success(`Tracker preset ${presetName} saved.`);
}

/**
 * Event handler for renaming an existing preset.
 */
function onPresetRenameClick() {
	const oldName = $("#tracker_preset_select").val();
	const newName = prompt("Enter the new name for the preset:", oldName);
	if (newName && !extensionSettings.presets[newName]) {
		extensionSettings.presets[newName] = extensionSettings.presets[oldName];
		delete extensionSettings.presets[oldName];
		if (extensionSettings.selectedPreset === oldName) {
			extensionSettings.selectedPreset = newName;
		}
		updatePresetDropdown();
		saveSettingsDebounced();
		toastr.success(`Tracker preset ${oldName} renamed to ${newName}.`);
	} else if (extensionSettings.presets[newName]) {
		alert("A preset with that name already exists.");
	}
}

/**
 * Event handler for renaming an existing preset.
 */
function onPresetRestoreClick() {
	const presetSettings = extensionSettings.presets[extensionSettings.selectedPreset];

	// Restore settings with preset settings
	Object.assign(extensionSettings, presetSettings);

	setSettingsInitialValues();
	clearDockTemplatePreview();
	saveSettingsDebounced();
	toastr.success(`Tracker preset ${extensionSettings.selectedPreset} restored.`);
}

/**
 * Event handler for deleting a preset.
 */
function onPresetDeleteClick() {
	const presetName = $("#tracker_preset_select").val();
	if (confirm(`Are you sure you want to delete the preset "${presetName}"?`)) {
		delete extensionSettings.presets[presetName];
		extensionSettings.selectedPreset = Object.keys(extensionSettings.presets)[0];
		updatePresetDropdown();
		onPresetSelectChange.call($("#tracker_preset_select"));
		saveSettingsDebounced();
		toastr.success(`Tracker preset ${presetName} deleted.`);
	}
}

/**
 * Event handler for exporting a preset.
 */
function onPresetExportClick() {
	const presetName = $("#tracker_preset_select").val();
	const presetData = extensionSettings.presets[presetName];
	const dataStr = JSON.stringify({ [presetName]: presetData }, null, 2);
	const blob = new Blob([dataStr], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const a = $("<a>").attr("href", url).attr("download", `${presetName}.json`);
	$("body").append(a);
	a[0].click();
	a.remove();
	URL.revokeObjectURL(url);
}

/**
 * Event handler for clicking the import button.
 */
function onPresetImportButtonClick() {
	$("#tracker_preset_import").click();
}

/**
 * Event handler for importing presets from a file.
 * @param {Event} event The change event from the file input.
 */
function onPresetImportChange(event) {
	const file = event.target.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			const importedPresets = JSON.parse(e.target.result);

			migrateIsDynamicToPresence(importedPresets);
			
			for (const presetName in importedPresets) {
				if (!extensionSettings.presets[presetName] || confirm(`Preset "${presetName}" already exists. Overwrite?`)) {
					extensionSettings.presets[presetName] = importedPresets[presetName];
				}
			}
			updatePresetDropdown();
			saveSettingsDebounced();
			toastr.success("Presets imported successfully.");
		} catch (err) {
			alert("Failed to import presets: " + err.message);
		}
	};
	reader.readAsText(file);
}

/**
 * Retrieves the current settings to save as a preset.
 * @returns {Object} The current preset settings.
 */
function getCurrentPresetSettings() {
	return {
		generationMode: extensionSettings.generationMode,

		generateContextTemplate: extensionSettings.generateContextTemplate,
		generateSystemPrompt: extensionSettings.generateSystemPrompt,
		generateRequestPrompt: extensionSettings.generateRequestPrompt,
		generateRecentMessagesTemplate: extensionSettings.generateRecentMessagesTemplate,
		
		messageSummarizationContextTemplate: extensionSettings.messageSummarizationContextTemplate,
		messageSummarizationSystemPrompt: extensionSettings.messageSummarizationSystemPrompt,
		messageSummarizationRequestPrompt: extensionSettings.messageSummarizationRequestPrompt,
		messageSummarizationRecentMessagesTemplate: extensionSettings.messageSummarizationRecentMessagesTemplate,

		inlineRequestPrompt: extensionSettings.inlineRequestPrompt,
		
		characterDescriptionTemplate: extensionSettings.characterDescriptionTemplate,

		mesTrackerTemplate: extensionSettings.mesTrackerTemplate,
		mesTrackerJavascript: extensionSettings.mesTrackerJavascript,
		dockTemplateEnabled: extensionSettings.dockTemplateEnabled,
		dockTemplateHtml: extensionSettings.dockTemplateHtml,
		dockTemplateCss: extensionSettings.dockTemplateCss,
		dockTemplateJs: extensionSettings.dockTemplateJs,
		trackerDef: extensionSettings.trackerDef,
	};
}

// #endregion

// #region Setting Change Handlers

/**
 * Returns a function to handle checkbox input changes for a given setting.
 * @param {string} settingName The name of the setting.
 * @returns {Function} The event handler function.
 */
function onSettingCheckboxInput(settingName) {
	return function () {
		const value = Boolean($(this).prop("checked"));
		extensionSettings[settingName] = value;
		saveSettingsDebounced();
	};
}

/**
 * Returns a function to handle select input changes for a given setting.
 * @param {string} settingName The name of the setting.
 * @returns {Function} The event handler function.
 */
function onSettingSelectChange(settingName) {
	return function () {
		const value = $(this).val();
		extensionSettings[settingName] = value;
		saveSettingsDebounced();
		if (settingName === "generationTarget") {
			updatePopupDropdown();
		}
	};
}

/**
 * Event handler for changing the generation mode.
 * Updates the field visibility based on the selected mode.
 */
function onGenerationModeChange() {
	const value = $(this).val();
	extensionSettings.generationMode = value;
	updateFieldVisibility(value);
	saveSettingsDebounced();
}

/**
 * Returns a function to handle textarea input changes for a given setting.
 * @param {string} settingName The name of the setting.
 * @returns {Function} The event handler function.
 */
function onSettingInputareaInput(settingName) {
	return function () {
		const value = $(this).val();
		extensionSettings[settingName] = value;
		saveSettingsDebounced();
		if(settingName === "mesTrackerJavascript") {
			processTrackerJavascript();
		}
	};
}

/**
 * Processes and validates the user-provided JavaScript for mesTrackerJavascript,
 * ensuring optional init and cleanup functions are handled correctly.
 */
function processTrackerJavascript() {
    try {
        const scriptContent = extensionSettings.mesTrackerJavascript;

        // Parse user input as a function and execute it
        const parsedFunction = new Function(`return (${scriptContent})`)();

        let parsedObject;
        if (typeof parsedFunction === "function") {
            parsedObject = parsedFunction(); // Call the function to get the object
        } else if (typeof parsedFunction === "object" && parsedFunction !== null) {
            parsedObject = parsedFunction;
        }

        // Ensure the final result is an object
        if (typeof parsedObject === "object" && parsedObject !== null) {
            // Call cleanup function of the existing tracker before replacing it
            if (SillyTavern.tracker && typeof SillyTavern.tracker.cleanup === "function") {
                try {
                    SillyTavern.tracker.cleanup();
                    debug("Previous tracker cleaned up successfully.");
                } catch (cleanupError) {
                    error("Error during tracker cleanup:", cleanupError);
                }
            }

            // Assign the new tracker object
            SillyTavern.tracker = parsedObject;

            // Call init function only if both init and cleanup exist
            if (
                typeof SillyTavern.tracker.init === "function" &&
                typeof SillyTavern.tracker.cleanup === "function"
            ) {
                try {
                    SillyTavern.tracker.init();
                    debug("Tracker initialized successfully.");
                } catch (initError) {
                    error("Error initializing tracker:", initError);
                }
            }

            debug("Custom tracker functions updated:", SillyTavern.tracker);
        }
    } catch (err) {
		debug("Error processing tracker JavaScript:", err);
        SillyTavern.tracker = {};
    }
}

let dockTemplateActiveTextarea = null;
let dockTemplateMacroGroups = null;
let dockTemplateImportQueue = [];
let dockTemplateImportActive = false;
let dockTemplateImportInputId = "";

function openDockTemplateEditor() {
	const modal = $("#tracker_dock_template_modal");
	if (!modal.length) return;

	if (!modal.data("original-parent")) {
		modal.data("original-parent", modal.parent());
	}

	modal.detach();
	$("body").append(modal);
	positionDockTemplateModal();
	modal.show();
}

function closeDockTemplateEditor() {
	const modal = $("#tracker_dock_template_modal");
	if (!modal.length) return;
	modal.hide();

	const originalParent = modal.data("original-parent");
	if (originalParent && originalParent.length) {
		originalParent.append(modal);
	}
}

function getDockTemplateAnchorRect() {
	const selectors = ["#expression-wrapper", "#extensions_settings2", "#extensions_settings"];
	for (const sel of selectors) {
		const el = document.querySelector(sel);
		if (el) return el.getBoundingClientRect();
	}
	return null;
}

function positionDockTemplateModal() {
	const modal = $("#tracker_dock_template_modal");
	const box = modal.find(".tracker-modal");
	if (!modal.length || !box.length) return;

	const rect = getDockTemplateAnchorRect();
	const margin = 10;

	if (!rect) {
		modal.css({ left: "0px", top: "0px", width: "100vw", height: "100vh", paddingTop: "60px" });
		box.css({ width: "min(var(--sheldWidth), 92vw)" });
		return;
	}

	modal.css({
		left: `${rect.left}px`,
		top: `${rect.top}px`,
		width: `${rect.width}px`,
		height: `${rect.height}px`,
		paddingTop: `${margin}px`,
	});

	const innerWidth = Math.max(280, rect.width - margin * 2);
	const innerHeight = Math.max(200, rect.height - margin * 2);
	box.css({ width: `${innerWidth}px`, maxHeight: `${innerHeight}px` });
}

function toLowerCamel(str) {
	const s = String(str ?? "");
	if (!s) return "";
	return s[0].toLowerCase() + s.slice(1);
}

function singularize(name) {
	const n = String(name ?? "");
	if (n.endsWith("ies")) return n.slice(0, -3) + "y";
	if (n.endsWith("ses")) return n.slice(0, -2);
	if (n.endsWith("s")) return n.slice(0, -1);
	return n;
}

function getDockTemplateDraftFromUI() {
	return {
		enabled: Boolean($("#tracker_dock_template_enabled").prop("checked")),
		html: $("#tracker_dock_template_html").val() ?? "",
		css: $("#tracker_dock_template_css").val() ?? "",
		js: $("#tracker_dock_template_js").val() ?? "",
	};
}

function onDockTemplateSettingsChange() {
	applyDockTemplatePreviewFromUI();
}

function applyDockTemplatePreviewFromUI() {
	const draft = getDockTemplateDraftFromUI();
	if (!draft.enabled) {
		clearDockTemplatePreview();
		return;
	}
	setDockTemplatePreview(draft);
}

function onDockTemplateSaveClick() {
	const draft = getDockTemplateDraftFromUI();
	extensionSettings.dockTemplateEnabled = draft.enabled;
	extensionSettings.dockTemplateHtml = draft.html;
	extensionSettings.dockTemplateCss = draft.css;
	extensionSettings.dockTemplateJs = draft.js;
	if (extensionSettings.dockTemplatePresets && extensionSettings.selectedDockTemplatePreset) {
		extensionSettings.dockTemplatePresets[extensionSettings.selectedDockTemplatePreset] = {
			enabled: draft.enabled,
			html: draft.html,
			css: draft.css,
			js: draft.js,
		};
	}
	saveSettingsDebounced();
	clearDockTemplatePreview();
	toastr.success("Dock template saved.");
}

function onDockTemplateCancelClick() {
	$("#tracker_dock_template_enabled").prop("checked", extensionSettings.dockTemplateEnabled);
	$("#tracker_dock_template_html").val(extensionSettings.dockTemplateHtml);
	$("#tracker_dock_template_css").val(extensionSettings.dockTemplateCss);
	$("#tracker_dock_template_js").val(extensionSettings.dockTemplateJs);
	clearDockTemplatePreview();
}

function onDockTemplateImportFilesChange(event) {
	const files = Array.from(event.target.files || []);
	if (!files.length) return;

	const byExt = {
		html: files.find((f) => f.name.toLowerCase().endsWith(".html")),
		css: files.find((f) => f.name.toLowerCase().endsWith(".css")),
		js: files.find((f) => f.name.toLowerCase().endsWith(".js")),
	};

	const readFile = (file, cb) => {
		if (!file) return cb("");
		const reader = new FileReader();
		reader.onload = (e) => cb(e.target.result ?? "");
		reader.readAsText(file);
	};

	readFile(byExt.html, (html) => {
		if (html) $("#tracker_dock_template_html").val(html);
		readFile(byExt.css, (css) => {
			if (css) $("#tracker_dock_template_css").val(css);
			readFile(byExt.js, (js) => {
				if (js) $("#tracker_dock_template_js").val(js);
				applyDockTemplatePreviewFromUI();
			});
		});
	});

	event.target.value = "";
}

function onDockTemplateExportClick(type) {
	let content = "";
	let filename = "dock-template";

	if (type === "html") {
		content = $("#tracker_dock_template_html").val() ?? "";
		filename += ".html";
	} else if (type === "css") {
		content = $("#tracker_dock_template_css").val() ?? "";
		filename += ".css";
	} else if (type === "js") {
		content = $("#tracker_dock_template_js").val() ?? "";
		filename += ".js";
	}

	const blob = new Blob([content], { type: "text/plain" });
	const url = URL.createObjectURL(blob);

	const a = $("<a>").attr("href", url).attr("download", filename);
	$("body").append(a);
	a[0].click();
	a.remove();
	URL.revokeObjectURL(url);
}

function exportDockTemplateFiles() {
	onDockTemplateExportClick("html");
	onDockTemplateExportClick("css");
	onDockTemplateExportClick("js");
}

function runDockTemplateEditorCommand(textareaId, command) {
	const el = document.getElementById(textareaId);
	if (!el) return;
	el.focus();
	document.execCommand(command);
}

function buildDockTemplateMacroList() {
	const listEl = $("#tracker_dock_template_macros");
	if (!listEl.length) return;

	listEl.empty();
	const schema = extensionSettings.trackerDef || {};
	const selectedGroup = $("#tracker_dock_template_macro_group").val() || "all";
	const macros = [];
	const groupSelect = $("#tracker_dock_template_macro_group");
	const groupOptions = new Map();
	const categoryNames = new Set(["MainCharacters", "OtherCharacters", "SmallEnemies", "BigEnemies"]);

	for (const field of Object.values(schema)) {
		const name = field.name;
		const type = String(field.type || "").toUpperCase();
		const groupName = name;
		if (!groupOptions.has(groupName)) {
			groupOptions.set(groupName, groupName);
		}

		const isGeneralGroup = selectedGroup === "general";
		if (isGeneralGroup && categoryNames.has(groupName)) {
			continue;
		}
		if (selectedGroup !== "all" && !isGeneralGroup && selectedGroup !== groupName) {
			continue;
		}

		if (type === "FOR_EACH_OBJECT" || type === "FOR_EACH_ARRAY") {
			const alias = toLowerCamel(singularize(name));
			macros.push(`{{#foreach ${name} ${alias}}}`);
			macros.push(`{{${alias}}}`);
			if (field.nestedFields) {
				for (const nested of Object.values(field.nestedFields)) {
					macros.push(`{{${alias}.${nested.name}}}`);
				}
			}
			macros.push(`{{/foreach}}`);
		} else if (type === "OBJECT" && field.nestedFields) {
			for (const nested of Object.values(field.nestedFields)) {
				macros.push(`{{${name}.${nested.name}}}`);
			}
		} else if (type === "ARRAY") {
			macros.push(`{{#join "; " ${name}}}`);
		} else {
			macros.push(`{{${name}}}`);
		}
	}

	if (groupSelect.length) {
		groupSelect.empty();
		groupSelect.append($("<option>").val("all").text("All"));
		const hasGeneral = Object.values(schema).some((field) => !categoryNames.has(field.name));
		if (hasGeneral) {
			groupSelect.append($("<option>").val("general").text("General"));
		}
		for (const groupName of groupOptions.values()) {
			groupSelect.append($("<option>").val(groupName).text(groupName));
		}
		groupSelect.val(selectedGroup);
	}

	macros.forEach((macro) => {
		const btn = $("<button>")
			.addClass("menu_button interactable")
			.text(macro)
			.attr("type", "button")
			.on("click", () => insertDockTemplateMacro(macro));
		listEl.append(btn);
	});
}

function insertDockTemplateMacro(text) {
	const target = dockTemplateActiveTextarea || document.getElementById("tracker_dock_template_html");
	if (!target) return;

	const start = target.selectionStart ?? 0;
	const end = target.selectionEnd ?? 0;
	const value = target.value ?? "";
	target.value = value.slice(0, start) + text + value.slice(end);
	target.selectionStart = target.selectionEnd = start + text.length;
	target.focus();
	applyDockTemplatePreviewFromUI();
}

function hexToRgb(hex) {
	const raw = String(hex ?? "").replace("#", "").trim();
	if (raw.length !== 6) return null;
	const r = parseInt(raw.slice(0, 2), 16);
	const g = parseInt(raw.slice(2, 4), 16);
	const b = parseInt(raw.slice(4, 6), 16);
	if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
	return { r, g, b };
}

function updateDockTemplateColorPreview() {
	const color = $("#tracker_dock_template_color").val() || "#000000";
	const opacityVal = Number($("#tracker_dock_template_opacity").val() || 100);
	const alpha = Math.max(0, Math.min(1, opacityVal / 100));
	const rgb = hexToRgb(color) || { r: 0, g: 0, b: 0 };
	const value = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
	$("#tracker_dock_template_color_value").text(value);
}

function insertDockTemplateColor() {
	const colorText = $("#tracker_dock_template_color_value").text() || "";
	if (colorText) insertDockTemplateMacro(colorText);
}

function applySettingsPanelTheme() {
	const color = extensionSettings.settingsPanelColor || "#111111";
	const opacityVal = Number(extensionSettings.settingsPanelOpacity ?? 100);
	const alpha = Math.max(0, Math.min(1, opacityVal / 100));
	const rgb = hexToRgb(color) || { r: 17, g: 17, b: 17 };
	const value = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
	$("#tracker_settings .inline-drawer-content").css("background", value);
	$("#tracker_settings_panel_value").text(value);
}

function onSettingsPanelThemeChange() {
	extensionSettings.settingsPanelColor = $("#tracker_settings_panel_color").val() || "#111111";
	extensionSettings.settingsPanelOpacity = Number($("#tracker_settings_panel_opacity").val() || 100);
	saveSettingsDebounced();
	applySettingsPanelTheme();
}


/**
 * Returns a function to handle number input changes for a given setting.
 * @param {string} settingName The name of the setting.
 * @returns {Function} The event handler function.
 */
function onSettingNumberInput(settingName) {
	return function () {
		let value = parseFloat($(this).val());
		if (isNaN(value)) {
			value = 0;
		}

		if(settingName == "numberOfMessages" && value < 1) {
			value = 1; 
			$(this).val(1);
		}
		extensionSettings[settingName] = value;
		saveSettingsDebounced();
	};
}

/**
 * Event handler for clicking the Tracker Prompt Maker button.
 */
function onTrackerPromptMakerClick() {
	const modal = new TrackerPromptMakerModal();
	modal.show(extensionSettings.trackerDef, (updatedTracker) => {
		extensionSettings.trackerDef = updatedTracker;
		saveSettingsDebounced();
	});
}

/**
 * Event handler for resetting the tracker prompts to default.
 */
function onTrackerPromptResetClick() {
    let resetButton = $("#tracker_reset_presets");
    let resetLabel = resetButton.parent().find("label");

    resetLabel.text("Click again to confirm");

    // Remove the current click event to avoid duplicate bindings
    resetButton.off("click");

    // Set a timeout to restore the original behavior after 60 seconds
    let timeoutId = setTimeout(() => {
        resetLabel.text("");
        resetButton.off("click").on("click", onTrackerPromptResetClick);
    }, 60000);

    // Bind the second-click event to reset presets
    resetButton.one("click", function () {
        clearTimeout(timeoutId); // Clear the timeout to prevent reverting behavior

		debug("Resetting default tracker prompts to default settings.");

        // Add logic here to reset the presets
		Object.keys(defaultSettings.presets).forEach(presetName => {
			extensionSettings.presets[presetName] = defaultSettings.presets[presetName];
			if(extensionSettings.selectedPreset === presetName) {
				Object.assign(extensionSettings, defaultSettings.presets[presetName]);
			}
		});
		saveSettingsDebounced();
		setSettingsInitialValues();

        // Restore the original behavior
		resetLabel.text("");
		resetButton.off("click").on("click", onTrackerPromptResetClick);
    });
}

// #endregion

// #region Field Visibility Management

/**
 * Updates the visibility of fields based on the selected generation mode.
 * @param {string} mode The current generation mode.
 */
function updateFieldVisibility(mode) {
	// Hide all sections first
	$("#generate_context_section").hide();
	$("#message_summarization_section").hide();
	$("#inline_request_section").hide();

	// Show fields based on the selected mode
	if (mode === generationModes.INLINE) {
		$("#inline_request_section").show();
	} else if (mode === generationModes.SINGLE_STAGE) {
		$("#generate_context_section").show();
	} else if (mode === generationModes.TWO_STAGE) {
		$("#generate_context_section").show();
		$("#message_summarization_section").show();
	}
}

// #endregion

// #region Popup Options Management

/**
 * Updates the popup for dropdown with the available values.
 */
function updatePopupDropdown() {
	const showPopupForSelect = $("#tracker_show_popup_for");
	const availablePopupOptions = [];
	switch (extensionSettings.generationTarget) {
		case generationTargets.CHARACTER:
			availablePopupOptions.push(generationTargets.USER);
			availablePopupOptions.push(generationTargets.NONE);
			break;
		case generationTargets.USER:
			availablePopupOptions.push(generationTargets.CHARACTER);
			availablePopupOptions.push(generationTargets.NONE);
			break;
		case generationTargets.BOTH:
			availablePopupOptions.push(generationTargets.NONE);
			break;
		case generationTargets.NONE:
			availablePopupOptions.push(generationTargets.BOTH);
			availablePopupOptions.push(generationTargets.USER);
			availablePopupOptions.push(generationTargets.CHARACTER);
			availablePopupOptions.push(generationTargets.NONE);
			break;
	}

	if(!availablePopupOptions.includes(extensionSettings.showPopupFor)) {
		extensionSettings.showPopupFor = generationTargets.NONE;
		saveSettingsDebounced();
	}

	showPopupForSelect.empty();
	for (const popupOption of availablePopupOptions) {
		const text = toTitleCase(popupOption);
		const option = $("<option>").val(popupOption).text(text);
		if (popupOption === extensionSettings.showPopupFor) {
			option.attr("selected", "selected");
		}
		showPopupForSelect.append(option);
	}
}

// #endregion
