import { debug, error, warn } from "../../../lib/utils.js";

export class TrackerPromptMaker {
	/**
	 * Constructor for TrackerPromptMaker.
	 * @param {Object} existingObject - Optional existing JSON object to prepopulate the component.
	 * @param {Function} onTrackerPromptSave - Callback function invoked when the backend object is updated.
	 */
	constructor(existingObject = {}, onTrackerPromptSave = () => {}) {
		this.backendObject = {}; // Internal representation of the prompt structure.
		this.onTrackerPromptSave = onTrackerPromptSave; // Save callback.
		this.element = $('<div class="tracker-prompt-maker"></div>'); // Root element of the component.
		this.fieldCounter = 0; // Counter to generate unique field IDs.
		this.exampleCounter = 0;
		this.multiSelectEnabled = false;
		this.selectedFieldIds = new Set();
		this.clipboardFieldData = null;
		this.lastFocusedFieldId = null;
		this.init(existingObject); // Initialize the component.
	}

	static get FIELD_TYPES() {
		return {
			STRING: "String",
			ARRAY: "Array",
			OBJECT: "Object",
			FOR_EACH_OBJECT: "For Each Object",
			FOR_EACH_ARRAY: "For Each Array",
			ARRAY_OBJECT: "Array Object",
		};
	}

	static get NESTING_FIELD_TYPES() {
		return ["OBJECT", "FOR_EACH_OBJECT", "FOR_EACH_ARRAY", "ARRAY_OBJECT"];
	}

	static get FIELD_PRESENCE_OPTIONS() {
		return {
			DYNAMIC: "Dynamic",
			EPHEMERAL: "Ephemeral",
			STATIC: "Static",
		};
	}

	static get FIELD_SCOPE_OPTIONS() {
		return {
			UNIVERSAL: "Universal (All Entities)",
			BOTH: "Both Char + User",
			CHAR: "Char-only",
			USER: "User-only",
		};
	}

	static get FIELD_INCLUDE_OPTIONS() {
		return {
			DYNAMIC: "dynamic",
			STATIC: "static",
			ALL: "all",
		};
	}

	/**
	 * Initializes the component by building the UI and populating with existing data if provided.
	 * @param {Object} existingObject - Optional existing JSON object.
	 */
	init(existingObject) {
		this.buildUI(); // Build the initial UI.
		if (Object.keys(existingObject).length > 0) {
			this.populateFromExistingObject(existingObject); // Prepopulate if data is provided.
		} else {
			// Initialize sortable after the UI is ready
			this.makeFieldsSortable(this.fieldsContainer, this.backendObject);
		}
	}

	/**
	 * Builds the main UI elements of the component.
	 */
	buildUI() {
		// Clear existing content in this.element to prevent duplication
		this.element.empty();

		const makeIconButton = (label, title) =>
			$(`<button class="menu_button interactable icon-button">${label}</button>`).attr("title", title);

		const layout = $('<div class="tracker-prompt-maker-layout"></div>');
		const sidebar = $('<div class="prompt-maker-sidebar"></div>');
		const content = $('<div class="prompt-maker-content"></div>');

		// Container for fields.
		this.fieldsContainer = $('<div class="fields-container"></div>');
		content.append(this.fieldsContainer);
		layout.append(sidebar, content);
		this.element.append(layout);

		this.element.off("mousedown.trackerPromptMaker").on("mousedown.trackerPromptMaker", (e) => {
			const target = $(e.target);
			if (target.closest(".field-wrapper").length > 0) return;
			if (target.closest(".buttons-wrapper").length > 0) return;
			this.clearSelection();
		});

		const buttonsWrapper = $('<div class="buttons-wrapper"></div>');

		// Button to add a new field.
		const addFieldBtn = makeIconButton("+", "Add Field").on("click", () => {
			this.addField();
			this.rebuildBackendObjectFromDOM();
		});
		buttonsWrapper.append(addFieldBtn);

		// Button to add example values to all fields.
		const addExampleValueBtn = makeIconButton("E+", "Add Example Value").on("click", () => {
			this.addExampleValueToAllFields();
		});
		buttonsWrapper.append(addExampleValueBtn);

		// Button to remove example values from all fields.
		const removeExampleValueBtn = makeIconButton("E-", "Remove Example Value").on("click", () => {
			this.removeExampleValueFromAllFields();
		});
		buttonsWrapper.append(removeExampleValueBtn);

		const multiSelectBtn = makeIconButton("MS", "Multi-select").on("click", () => {
			this.toggleMultiSelect();
		});
		buttonsWrapper.append(multiSelectBtn);

		const bulkDeleteBtn = makeIconButton("Del", "Delete Selected")
			.prop("disabled", true)
			.on("click", () => this.deleteSelectedFields());
		const bulkMoveUpBtn = makeIconButton("^", "Move Up")
			.prop("disabled", true)
			.on("click", () => this.moveSelectedFields("up"));
		const bulkMoveDownBtn = makeIconButton("v", "Move Down")
			.prop("disabled", true)
			.on("click", () => this.moveSelectedFields("down"));
		this.bulkButtons = { bulkDeleteBtn, bulkMoveUpBtn, bulkMoveDownBtn };
		buttonsWrapper.append(bulkMoveUpBtn, bulkMoveDownBtn, bulkDeleteBtn);

		const copyBtn = makeIconButton("Cpy", "Copy")
			.prop("disabled", true)
			.on("click", () => this.copySelectedField());
		const pasteBtn = makeIconButton("Pst", "Paste")
			.prop("disabled", true)
			.on("click", () => this.pasteField());
		const duplicateBtn = makeIconButton("Dup", "Duplicate")
			.prop("disabled", true)
			.on("click", () => this.duplicateSelectedField());
		this.clipboardButtons = { copyBtn, pasteBtn, duplicateBtn };
		buttonsWrapper.append(copyBtn, pasteBtn, duplicateBtn);

		const deselectBtn = makeIconButton("Clr", "Deselect")
			.on("click", () => this.clearSelection());
		buttonsWrapper.append(deselectBtn);

		const navTitle = $('<div class="prompt-maker-nav-title">Navigator</div>');
		this.navContainer = $('<div class="prompt-maker-nav"></div>');
		sidebar.append(buttonsWrapper, navTitle, this.navContainer);
	}

	/**
	 * Makes a given container and its nested containers sortable.
	 * @param {jQuery} container - The container whose fields should be sortable.
	 * @param {Object} parentBackendObject - The corresponding backend object section.
	 */
    makeFieldsSortable(container, parentBackendObject) {
        container.on("mousedown", "> .field-wrapper > .name-dynamic-type-wrapper > .drag-handle", function (event) {
            container.css("height", `${container.height()}px`);
            container.addClass("dragging");
        });
    
        container.on("mouseup", "> .field-wrapper > .name-dynamic-type-wrapper > .drag-handle", function () {
            if (!container.hasClass("ui-sortable-helper")) {
                container.removeClass("dragging");
                container.css("height", "");
            }
        });
    
        container
            .sortable({
                items: "> .field-wrapper",
                handle: "> .name-dynamic-type-wrapper > .drag-handle", // Specify the drag handle
                axis: "y", // Lock movement to vertical axis
                tolerance: "intersect", // Use intersect location for placeholder positioning
                helper: function (event, ui) {
                    // Clone the element to create a helper
                    const helper = ui.clone();
					// Style the helper to show only the name-dynamic-type-wrapper
					helper.children(":not(.name-dynamic-type-wrapper)").hide(); // Hide all except name-dynamic-type-wrapper
                    return helper;
                },
                cursorAt: { top: 10, left: 10 }, // Adjust the cursor's position relative to the dragged element
				stop: () => {
					// Remove the dragging class and reset container height
					container.removeClass("dragging");
					container.css("height", ""); // Remove the fixed height
					// Rebuild backend object when drag operation ends
					this.rebuildBackendObjectFromDOM();
				},
            })
    }
    
	/**
	 * Helper function to find a field's data object in the backendObject by fieldId.
	 * @param {string} fieldId - The ID of the field to find.
	 * @param {Object} obj - The current object to search within.
	 * @returns {Object|null} - The field data object or null if not found.
	 */
	getFieldDataById(fieldId, obj = this.backendObject) {
		for (const key in obj) {
			if (key === fieldId) {
				return obj[key];
			}
			if (obj[key].nestedFields) {
				const found = this.getFieldDataById(fieldId, obj[key].nestedFields);
				if (found) return found;
			}
		}
		return null;
	}

	/**
	 * Adds a new field to the component.
	 * @param {Object|null} parentObject - The parent object in the backendObject where the field should be added.
	 * @param {string|null} parentFieldId - ID of the parent field if adding a nested field.
	 * @param {Object} fieldData - Optional data to prepopulate the field.
	 * @param {string|null} fieldId - Optional field ID to use (maintains consistency when loading existing data).
	 * @param {boolean} [isNewField=true] - Flag indicating if the field is new or being loaded from existing data.
	 */
	addField(parentObject = null, parentFieldId = null, fieldData = {}, fieldId = null, isNewField = true) {
		if (!fieldId) {
			fieldId = `field-${this.fieldCounter++}`; // Generate a unique field ID.
		} else {
			// Ensure fieldCounter is ahead of field IDs
			const idNum = parseInt(fieldId.split("-")[1]);
			if (idNum >= this.fieldCounter) {
				this.fieldCounter = idNum + 1;
			}
		}

		if (!fieldData.exampleValues) {
			fieldData.exampleValues = [];
			for (let i = 0; i < this.exampleCounter; i++) {
				fieldData.exampleValues.push("");
			}
		}

		const fieldWrapper = $('<div class="field-wrapper"></div>').attr("data-field-id", fieldId);
		fieldWrapper.on("click focusin", () => {
			this.lastFocusedFieldId = fieldId;
			this.updateBulkButtonsState();
		});

		// Combined div for Field Name, Static/Dynamic Toggle, and Field Type Selector
		const nameDynamicTypeDiv = $('<div class="name-dynamic-type-wrapper"></div>');

		// Multi-select checkbox
		const selectCheckbox = $('<input type="checkbox" class="field-select">')
			.on("change", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				if (e.target.checked) {
					this.selectedFieldIds.add(currentFieldId);
					fieldWrapper.addClass("is-selected");
				} else {
					this.selectedFieldIds.delete(currentFieldId);
					fieldWrapper.removeClass("is-selected");
				}
				this.updateBulkButtonsState();
			});
		nameDynamicTypeDiv.append(selectCheckbox);

		// Collapse Toggle (for nested fields)
		const collapseToggle = $('<span class="collapse-toggle" role="button" tabindex="0">▾</span>')
			.on("click", (e) => {
				e.preventDefault();
				fieldWrapper.toggleClass("is-collapsed");
				const isCollapsed = fieldWrapper.hasClass("is-collapsed");
				collapseToggle.text(isCollapsed ? "▸" : "▾");
			});
		nameDynamicTypeDiv.append(collapseToggle);

		// Drag Handle
		const dragHandle = $('<span class="drag-handle">&#x2630;</span>'); // Unicode for hamburger icon
		nameDynamicTypeDiv.append(dragHandle);

		// Field Name Input with label
		const fieldNameLabel = $("<label>Field Name:</label>");
		const fieldNameInput = $('<input type="text" class="text_pole" placeholder="Field Name">')
			.val(fieldData.name || "")
			.on("input", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.validateFieldName(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const fieldNameDiv = $('<div class="field-name-wrapper"></div>').append(fieldNameLabel, fieldNameInput);

		// Presence Selector with label
		const presenceLabel = $("<label>Presence:</label>");
		const presenceKey = fieldData.presence || "DYNAMIC";
		const presenceSelector = $(`
            <select>
                ${Object.entries(TrackerPromptMaker.FIELD_PRESENCE_OPTIONS)
					.map(([key, value]) => `<option value="${key}">${value}</option>`)
					.join("")}        
            </select>
        `)
			.val(presenceKey)
			.on("change", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.selectPresence(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const presenceDiv = $('<div class="presence-wrapper"></div>').append(presenceLabel, presenceSelector);

		// Scope Selector with label
		const scopeLabel = $("<label>Scope:</label>");
		const scopeKey = (fieldData.scope || "BOTH").toString().toUpperCase();
		const scopeSelector = $(`
            <select>
                ${Object.entries(TrackerPromptMaker.FIELD_SCOPE_OPTIONS)
					.map(([key, value]) => `<option value="${key}">${value}</option>`)
					.join("")}        
            </select>
        `)
			.val(scopeKey)
			.on("change", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.selectScope(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const scopeDiv = $('<div class="scope-wrapper"></div>').append(scopeLabel, scopeSelector);

		// Field Type Selector with label
		const fieldTypeLabel = $("<label>Field Type:</label>");
		const fieldTypeKey = fieldData.type || "STRING";
		const fieldTypeSelector = $(`
            <select>
                ${Object.entries(TrackerPromptMaker.FIELD_TYPES)
					.map(([key, value]) => `<option value="${key}">${value}</option>`)
					.join("")}        
            </select>
        `)
			.val(fieldTypeKey)
			.on("change", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.selectFieldType(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const fieldTypeDiv = $('<div class="field-type-wrapper"></div>').append(fieldTypeLabel, fieldTypeSelector);

		// Append field name, presence, scope, and field type to the combined div
		nameDynamicTypeDiv.append(fieldNameDiv, presenceDiv, scopeDiv, fieldTypeDiv);

		// Append the combined div to fieldWrapper
		fieldWrapper.append(nameDynamicTypeDiv);

		// Prompt, Default Value, and Example Values Wrapper
		const promptDefaultExampleWrapper = $('<div class="prompt-default-example-wrapper"></div>');

		// Prompt Input with label
		const promptLabel = $("<label>Prompt or Note:</label>");
		const promptInput = $('<textarea type="text" class="text_pole" placeholder="Prompt or Note"></textarea>')
			.val(fieldData.prompt || "")
			.on("input", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.updatePrompt(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const promptDiv = $('<div class="prompt-wrapper"></div>').append(promptLabel, promptInput);

		// Default and Example Wrapper
		const defaultExampleWrapper = $('<div class="default-example-wrapper"></div>');

		// Default Value Input with label
		const defaultValueLabel = $("<label>Default Value:</label>");
		const defaultValueInput = $('<input type="text" class="text_pole" placeholder="Default Value">')
			.val(fieldData.defaultValue || "")
			.on("input", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.updateDefaultValue(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const defaultValueDiv = $('<div class="default-value-wrapper"></div>').append(defaultValueLabel, defaultValueInput);

		// Example Values Heading and Container
		const exampleValuesHeading = $("<h4>Example Values:</h4>");
		const exampleValuesContainer = $('<div class="example-values-container"></div>');

		// Append default value div, example values heading, and container to defaultExampleWrapper
		defaultExampleWrapper.append(defaultValueDiv, exampleValuesHeading, exampleValuesContainer);

		// Append promptDiv and defaultExampleWrapper to promptDefaultExampleWrapper
		promptDefaultExampleWrapper.append(promptDiv, defaultExampleWrapper);

		// Append promptDefaultExampleWrapper to fieldWrapper
		fieldWrapper.append(promptDefaultExampleWrapper);

		// Nested Fields Container
		const nestedFieldsContainer = $('<div class="nested-fields-container"></div>');
		fieldWrapper.append(nestedFieldsContainer);

		const buttonsWrapper = $('<div class="buttons-wrapper"></div>');

		// Add Nested Field Button
		const addNestedFieldBtn = $('<button class="menu_button interactable">Add Nested Field</button>')
			.on("click", () => {
				this.addField(null, fieldId);
				// After adding a nested field, make it sortable
				const nestedFieldData = this.getFieldDataById(fieldId).nestedFields;
				this.makeFieldsSortable(nestedFieldsContainer, nestedFieldData);
				this.rebuildBackendObjectFromDOM();
			})
			.hide(); // Initially hidden

		// Show the button if the field type allows nesting
		if (TrackerPromptMaker.NESTING_FIELD_TYPES.includes(fieldData.type)) {
			addNestedFieldBtn.show();
			collapseToggle.show();
		} else {
			collapseToggle.hide();
		}

		buttonsWrapper.append(addNestedFieldBtn);

		// Remove Field Button
		const removeFieldBtn = $('<button class="menu_button interactable">Remove Field</button>').on("click", () => {
			this.removeField(fieldId, fieldWrapper);
		});
		buttonsWrapper.append(removeFieldBtn);

		fieldWrapper.append(buttonsWrapper);

		// Append fieldWrapper to the DOM
		if (parentFieldId) {
			const parentFieldWrapper = this.element.find(`[data-field-id="${parentFieldId}"] > .nested-fields-container`);
			parentFieldWrapper.append(fieldWrapper);
		} else {
			this.fieldsContainer.append(fieldWrapper);
		}

		debug(`Added field with ID: ${fieldId}`);

		// Initialize the backend object structure for this field
		if (parentFieldId) {
			const parentFieldData = this.getFieldDataById(parentFieldId);
			if (parentFieldData) {
				parentFieldData.nestedFields[fieldId] = {
					name: fieldData.name || "",
					type: fieldData.type || "STRING",
					presence: fieldData.presence || "DYNAMIC",
					scope: (fieldData.scope || "BOTH").toString().toUpperCase(),
					prompt: fieldData.prompt || "",
					defaultValue: fieldData.defaultValue || "",
					exampleValues: [...fieldData.exampleValues],
					nestedFields: {},
				};
			} else {
				error(`Parent field with ID ${parentFieldId} not found.`);
			}
		} else {
			this.backendObject[fieldId] = {
				name: fieldData.name || "",
				type: fieldData.type || "STRING",
				presence: fieldData.presence || "DYNAMIC",
				scope: (fieldData.scope || "BOTH").toString().toUpperCase(),
				prompt: fieldData.prompt || "",
				defaultValue: fieldData.defaultValue || "",
				exampleValues: [...fieldData.exampleValues],
				nestedFields: {},
			};
		}

		// Make nested fields sortable if this field type allows nesting
		if (TrackerPromptMaker.NESTING_FIELD_TYPES.includes(fieldData.type)) {
			const nestedFieldData = this.getFieldDataById(fieldId).nestedFields;
			this.makeFieldsSortable(nestedFieldsContainer, nestedFieldData);
		}

		// Populate example values if any
		if (fieldData.exampleValues && fieldData.exampleValues.length > 0) {
			fieldData.exampleValues.forEach((exampleValue) => {
				this.addExampleValue(fieldWrapper, exampleValue, false);
			});
		}

		// Recursively build nested fields if any
		if (fieldData.nestedFields && Object.keys(fieldData.nestedFields).length > 0) {
			Object.entries(fieldData.nestedFields).forEach(([nestedFieldId, nestedFieldData]) => {
				this.addField(null, fieldId, nestedFieldData, nestedFieldId, false);
			});
		}

		this.applyMultiSelectState(fieldWrapper);
		return fieldWrapper;
	}

	/**
	 * Removes a field from the component and backend object.
	 * @param {string} fieldId - The ID of the field to remove.
	 * @param {jQuery} fieldWrapper - The jQuery element of the field wrapper in the UI.
	 */
	removeField(fieldId, fieldWrapper) {
		// Confirm before removing
		if (confirm("Are you sure you want to remove this field?")) {
			// Remove from backend object
			this.deleteFieldDataById(fieldId);
			this.selectedFieldIds.delete(fieldId);
			// Remove from UI
			fieldWrapper.remove();
			debug(`Removed field with ID: ${fieldId}`);
			this.rebuildBackendObjectFromDOM(); // Rebuild keys after removal
			this.syncBackendObject();
			this.updateBulkButtonsState();
		}
	}

	toggleMultiSelect() {
		this.multiSelectEnabled = !this.multiSelectEnabled;
		if (!this.multiSelectEnabled) {
			this.selectedFieldIds.clear();
		}
		this.element.toggleClass("multi-select", this.multiSelectEnabled);
		this.element.find(".field-wrapper").each((_, el) => this.applyMultiSelectState($(el)));
		this.updateBulkButtonsState();
	}

	applyMultiSelectState(fieldWrapper) {
		const checkbox = fieldWrapper.find("> .name-dynamic-type-wrapper > .field-select");
		if (this.multiSelectEnabled) {
			checkbox.show();
			const fieldId = fieldWrapper.attr("data-field-id");
			checkbox.prop("checked", this.selectedFieldIds.has(fieldId));
			fieldWrapper.toggleClass("is-selected", this.selectedFieldIds.has(fieldId));
		} else {
			checkbox.hide().prop("checked", false);
			fieldWrapper.removeClass("is-selected");
		}
	}

	updateBulkButtonsState() {
		if (!this.bulkButtons) return;
		const hasSelection = this.selectedFieldIds.size > 0;
		this.bulkButtons.bulkDeleteBtn.prop("disabled", !hasSelection);
		this.bulkButtons.bulkMoveUpBtn.prop("disabled", !hasSelection);
		this.bulkButtons.bulkMoveDownBtn.prop("disabled", !hasSelection);

		if (this.clipboardButtons) {
			const hasActive = this.getActiveFieldId() !== null;
			const canCopy = hasSelection || hasActive;
			this.clipboardButtons.copyBtn.prop("disabled", !canCopy);
			this.clipboardButtons.duplicateBtn.prop("disabled", !canCopy);
			this.clipboardButtons.pasteBtn.prop("disabled", !this.clipboardFieldData);
		}
	}

	clearSelection() {
		this.selectedFieldIds.clear();
		this.lastFocusedFieldId = null;
		this.element.find(".field-wrapper").removeClass("is-selected");
		this.element.find(".field-select").prop("checked", false);
		this.updateBulkButtonsState();
	}

	updateNavLabel(fieldId, name) {
		if (!this.navContainer) return;
		const label = name && name.trim() ? name.trim() : "Untitled";
		const item = this.navContainer.find(`[data-nav-field-id="${fieldId}"] .nav-label`);
		if (item.length) {
			item.text(label);
		}
	}

	rebuildMiniNav() {
		if (!this.navContainer) return;
		this.navContainer.empty();
		const topLevelFields = this.fieldsContainer.children(".field-wrapper");
		topLevelFields.each((_, el) => {
			const wrapper = $(el);
			const fieldId = wrapper.attr("data-field-id");
			const name = wrapper.find("> .name-dynamic-type-wrapper .field-name-wrapper input").val() || "Untitled";
			const navItem = $(`
				<button class="menu_button interactable nav-item" data-nav-field-id="${fieldId}">
					<span class="nav-label"></span>
				</button>
			`);
			navItem.find(".nav-label").text(name);
			navItem.on("click", () => {
				el.scrollIntoView({ behavior: "smooth", block: "start" });
			});
			this.navContainer.append(navItem);
		});
	}

	getActiveFieldId() {
		if (this.selectedFieldIds.size === 1) {
			return Array.from(this.selectedFieldIds)[0];
		}
		return this.lastFocusedFieldId;
	}

	getSelectedFieldIdsOrdered() {
		const ordered = [];
		this.element.find(".field-wrapper").each((_, el) => {
			const fieldId = $(el).attr("data-field-id");
			if (this.selectedFieldIds.has(fieldId)) {
				ordered.push(fieldId);
			}
		});
		return ordered;
	}

	getSelectedFieldIdsByParent() {
		const grouped = new Map();
		this.element.find(".field-wrapper").each((_, el) => {
			const fieldId = $(el).attr("data-field-id");
			if (!this.selectedFieldIds.has(fieldId)) return;
			const parentContainer = $(el).parent().get(0);
			if (!grouped.has(parentContainer)) {
				grouped.set(parentContainer, []);
			}
			grouped.get(parentContainer).push(fieldId);
		});
		return grouped;
	}

	copySelectedField() {
		const selectedIds = this.getSelectedFieldIdsOrdered();
		if (selectedIds.length > 0) {
			this.clipboardFieldData = selectedIds
				.map((fieldId) => {
					const fieldData = this.getFieldDataById(fieldId);
					if (!fieldData) return null;
					const parentFieldId = this.findParentFieldId(fieldId);
					return { data: JSON.parse(JSON.stringify(fieldData)), parentFieldId };
				})
				.filter(Boolean);
		} else {
			const fieldId = this.getActiveFieldId();
			if (!fieldId) return;
			const fieldData = this.getFieldDataById(fieldId);
			if (!fieldData) return;
			const parentFieldId = this.findParentFieldId(fieldId);
			this.clipboardFieldData = {
				data: JSON.parse(JSON.stringify(fieldData)),
				parentFieldId,
			};
		}
		this.updateBulkButtonsState();
	}

	pasteField() {
		if (!this.clipboardFieldData) return;
		const selectedIds = this.getSelectedFieldIdsOrdered();
		const selectedId = this.getActiveFieldId();
		const activeParentId = selectedId ? this.findParentFieldId(selectedId) : null;
		const activeWrapper = selectedId
			? this.element.find(`[data-field-id="${selectedId}"]`)
			: null;

		if (Array.isArray(this.clipboardFieldData)) {
			const lastSelectedByParent = new Map();
			if (selectedIds.length > 0) {
				selectedIds.forEach((fieldId) => {
					const parentId = this.findParentFieldId(fieldId);
					const wrapper = this.element.find(`[data-field-id="${fieldId}"]`);
					if (wrapper.length) {
						lastSelectedByParent.set(parentId, wrapper);
					}
				});
			}
			this.clipboardFieldData.forEach((item) => {
				const clone = JSON.parse(JSON.stringify(item.data));
				const targetParentId = item.parentFieldId ?? null;
				const newWrapper = this.addField(null, targetParentId, clone, null, true);
				if (newWrapper) {
					const lastSelected = lastSelectedByParent.get(targetParentId);
					if (lastSelected && lastSelected.length) {
						newWrapper.insertAfter(lastSelected);
						lastSelectedByParent.set(targetParentId, newWrapper);
					} else if (activeWrapper && activeWrapper.length && activeParentId === targetParentId) {
						newWrapper.insertAfter(activeWrapper);
					} else if (targetParentId) {
						const parentWrapper = this.element.find(`[data-field-id="${targetParentId}"] > .nested-fields-container`);
						if (parentWrapper.length) {
							const lastChild = parentWrapper.children(".field-wrapper").last();
							if (lastChild.length) {
								newWrapper.insertAfter(lastChild);
							}
						}
					}
				}
			});
		} else {
			const clone = JSON.parse(JSON.stringify(this.clipboardFieldData.data));
			const targetParentId = this.clipboardFieldData.parentFieldId ?? activeParentId;
			const newWrapper = this.addField(null, targetParentId, clone, null, true);
			if (newWrapper) {
				if (activeWrapper && activeWrapper.length && activeParentId === targetParentId) {
					newWrapper.insertAfter(activeWrapper);
				}
			}
		}
		this.rebuildBackendObjectFromDOM();
		this.updateBulkButtonsState();
	}

	duplicateSelectedField() {
		const grouped = this.getSelectedFieldIdsByParent();
		if (grouped.size > 0) {
			grouped.forEach((fieldIds, parentContainer) => {
				let insertAfter = null;
				fieldIds.forEach((fieldId) => {
					const targetWrapper = this.element.find(`[data-field-id="${fieldId}"]`);
					if (targetWrapper.length) {
						insertAfter = targetWrapper;
					}
				});
				let lastInserted = insertAfter;
				fieldIds.forEach((fieldId) => {
					const fieldData = this.getFieldDataById(fieldId);
					if (!fieldData) return;
					const parentFieldId = this.findParentFieldId(fieldId);
					const clone = JSON.parse(JSON.stringify(fieldData));
					const newWrapper = this.addField(null, parentFieldId, clone, null, true);
					if (newWrapper && lastInserted) {
						newWrapper.insertAfter(lastInserted);
						lastInserted = newWrapper;
					}
				});
			});
		} else {
			const fieldId = this.getActiveFieldId();
			if (!fieldId) return;
			const fieldData = this.getFieldDataById(fieldId);
			if (!fieldData) return;
			const parentFieldId = this.findParentFieldId(fieldId);
			const clone = JSON.parse(JSON.stringify(fieldData));
			const newWrapper = this.addField(null, parentFieldId, clone, null, true);
			if (newWrapper) {
				const targetWrapper = this.element.find(`[data-field-id="${fieldId}"]`);
				if (targetWrapper.length) {
					newWrapper.insertAfter(targetWrapper);
				}
			}
		}
		this.rebuildBackendObjectFromDOM();
		this.updateBulkButtonsState();
	}

	findParentFieldId(fieldId, obj = this.backendObject, parentId = null) {
		for (const key in obj) {
			if (key === fieldId) return parentId;
			if (obj[key].nestedFields) {
				const found = this.findParentFieldId(fieldId, obj[key].nestedFields, key);
				if (found !== null) return found;
			}
		}
		return null;
	}

	deleteSelectedFields() {
		if (this.selectedFieldIds.size === 0) return;
		if (!confirm("Delete all selected fields?")) return;

		const ids = Array.from(this.selectedFieldIds);
		ids.forEach((fieldId) => {
			const fieldWrapper = this.element.find(`[data-field-id="${fieldId}"]`);
			if (fieldWrapper.length === 0) return;
			this.deleteFieldDataById(fieldId);
			fieldWrapper.remove();
		});
		this.selectedFieldIds.clear();
		this.rebuildBackendObjectFromDOM();
		this.syncBackendObject();
		this.updateBulkButtonsState();
	}

	moveSelectedFields(direction = "up") {
		if (this.selectedFieldIds.size === 0) return;

		const isUp = direction === "up";
		const grouped = this.getSelectedFieldIdsByParent();
		grouped.forEach((fieldIds, parentContainer) => {
			const ordered = isUp ? fieldIds : fieldIds.slice().reverse();
			ordered.forEach((fieldId) => {
				const $el = this.element.find(`[data-field-id="${fieldId}"]`);
				if ($el.length === 0) return;
				const sibling = isUp ? $el.prev(".field-wrapper") : $el.next(".field-wrapper");
				if (sibling.length === 0) return;
				const siblingId = sibling.attr("data-field-id");
				if (this.selectedFieldIds.has(siblingId)) return;
				if (isUp) {
					$el.insertBefore(sibling);
				} else {
					$el.insertAfter(sibling);
				}
			});
		});

		this.element
			.find(".field-wrapper")
			.filter((_, el) => this.selectedFieldIds.has($(el).attr("data-field-id")))
			.attr("data-keep-selected", "1");

		this.rebuildBackendObjectFromDOM();
		this.syncBackendObject();
		this.updateBulkButtonsState();
	}

	/**
	 * Helper function to delete a field's data from backendObject by fieldId.
	 * @param {string} fieldId - The ID of the field to delete.
	 * @param {Object} obj - The current object to search within.
	 * @returns {boolean} - True if deleted, false otherwise.
	 */
	deleteFieldDataById(fieldId, obj = this.backendObject) {
		for (const key in obj) {
			if (key === fieldId) {
				delete obj[key];
				return true;
			}
			if (obj[key].nestedFields) {
				const deleted = this.deleteFieldDataById(fieldId, obj[key].nestedFields);
				if (deleted) return true;
			}
		}
		return false;
	}

	/**
	 * Validates the field name to ensure it doesn't contain double quotes.
	 * @param {string} name - The field name entered by the user.
	 * @param {string} fieldId - The ID of the field being validated.
	 * @returns {boolean} - True if valid, false otherwise.
	 */
	validateFieldName(name, fieldId) {
		if (name.includes('"')) {
			warn("Field name cannot contain double quotes.");
			toastr.error("Field name cannot contain double quotes.");
			return false;
		}
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.name = name;
			this.updateNavLabel(fieldId, name);
			debug(`Validated field name: ${name} for field ID: ${fieldId}`);
			return true;
		} else {
			error(`Field with ID ${fieldId} not found during validation.`);
			return false;
		}
	}

	/**
	 * Handles the selection of the field type and updates the UI accordingly.
	 * @param {string} type - The selected field type.
	 * @param {string} fieldId - The ID of the field being updated.
	 */
	selectFieldType(type, fieldId) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.type = type || "STRING";
			debug(`Selected field type: ${type} for field ID: ${fieldId}`);
			const fieldWrapper = this.element.find(`[data-field-id="${fieldId}"]`);
			const addNestedFieldBtn = fieldWrapper.find(".menu_button:contains('Add Nested Field')");
			const collapseToggle = fieldWrapper.find(".collapse-toggle");
			const isNestingType = TrackerPromptMaker.NESTING_FIELD_TYPES.includes(type);
			addNestedFieldBtn.toggle(isNestingType);
			collapseToggle.toggle(isNestingType);
			if (!isNestingType) {
				fieldWrapper.removeClass("is-collapsed");
				collapseToggle.text("▾");
			}
		} else {
			error(`Field with ID ${fieldId} not found during type selection.`);
		}
	}

	/**
	 * Handles the selection of the presence.
	 * @param {string} presence - The selected presence.
	 * @param {string} fieldId - The ID of the field being updated.
	 */
	selectPresence(presence, fieldId) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.presence = presence || "DYNAMIC";
			debug(`Selected presence: ${presence} for field ID: ${fieldId}`);
		} else {
			error(`Field with ID ${fieldId} not found during presence selection.`);
		}
	}

	/**
	 * Handles the selection of the scope.
	 * @param {string} scope - The selected scope.
	 * @param {string} fieldId - The ID of the field.
	 */
	selectScope(scope, fieldId) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.scope = scope || "BOTH";
			debug(`Selected scope: ${scope} for field ID: ${fieldId}`);
		} else {
			error(`Field with ID ${fieldId} not found during scope selection.`);
		}
	}
	/**
	 * Updates the prompt or note for the field.
	 * @param {string} promptText - The prompt text entered by the user.
	 * @param {string} fieldId - The ID of the field being updated.
	 */
	updatePrompt(promptText, fieldId) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.prompt = promptText;
			debug(`Updated prompt for field ID: ${fieldId}`);
		} else {
			error(`Field with ID ${fieldId} not found during prompt update.`);
		}
	}

	/**
	 * Updates the default value for the field.
	 * @param {string} defaultValue - The default value entered by the user.
	 * @param {string} fieldId - The ID of the field being updated.
	 */
	updateDefaultValue(defaultValue, fieldId) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.defaultValue = defaultValue;
			debug(`Updated default value for field ID: ${fieldId}`);
		} else {
			error(`Field with ID ${fieldId} not found during default value update.`);
		}
	}

	/**
	 * Adds example value inputs to all fields and nested fields.
	 */
	addExampleValueToAllFields() {
		// Collect all fields into a flat array
		const allFields = [];

		const collectAllFields = (fields) => {
			Object.keys(fields).forEach((fieldId) => {
				const fieldData = fields[fieldId];
				allFields.push(fieldId);
				if (fieldData.nestedFields && Object.keys(fieldData.nestedFields).length > 0) {
					collectAllFields(fieldData.nestedFields);
				}
			});
		};

		collectAllFields(this.backendObject);

		// Add an example value to each field
		allFields.forEach((fieldId) => {
			const fieldWrapper = this.element.find(`[data-field-id="${fieldId}"]`);
			this.addExampleValue(fieldWrapper, "", true);
		});

		this.exampleCounter++;

		debug("Added example values to all fields.");
		this.syncBackendObject(); // Ensure backendObject is updated
	}

	/**
	 * Removes the last example value from all fields and nested fields.
	 */
	removeExampleValueFromAllFields() {
		// Collect all fields into a flat array
		const allFields = [];

		const collectAllFields = (fields) => {
			Object.keys(fields).forEach((fieldId) => {
				const fieldData = fields[fieldId];
				allFields.push(fieldId);
				if (fieldData.nestedFields && Object.keys(fieldData.nestedFields).length > 0) {
					collectAllFields(fieldData.nestedFields);
				}
			});
		};

		collectAllFields(this.backendObject);

		// Remove the last example value from each field
		allFields.forEach((fieldId) => {
			const fieldData = this.getFieldDataById(fieldId);
			if (fieldData && fieldData.exampleValues && fieldData.exampleValues.length > 0) {
				// Remove the last example value
				fieldData.exampleValues.pop();

				// Remove the last input element from the example values container
				const fieldWrapper = this.element.find(`[data-field-id="${fieldId}"]`);
				const exampleValuesContainer = fieldWrapper.find("> .prompt-default-example-wrapper > .default-example-wrapper > .example-values-container");
				exampleValuesContainer.find("input.text_pole").last().remove();

				// Update indices
				this.updateExampleValueIndices(fieldId);
			}
		});

		this.exampleCounter--;

		debug("Removed example values from all fields.");
		this.syncBackendObject();
	}

	/**
	 * Adds an example value input to a specific field.
	 * @param {jQuery} fieldWrapper - The jQuery element of the field wrapper.
	 * @param {string} exampleValue - Optional initial value for the example value.
	 * @param {boolean} [pushToBackend=true] - Whether to push the example value to the backend object.
	 */
	addExampleValue(fieldWrapper, exampleValue = "", pushToBackend = true) {
		const fieldId = fieldWrapper.attr("data-field-id");

		// Example value input
		const exampleValueInput = $('<input class="text_pole" type="text" placeholder="Example Value">')
			.val(exampleValue)
			.on("input", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				const index = $(e.target).data("index");
				this.updateExampleValue(currentFieldId, e.target.value, index);
				this.syncBackendObject();
			});

		// Assign an index to the example value input
		const index = this.getFieldDataById(fieldId).exampleValues.length;
		exampleValueInput.data("index", index);

		// Append the exampleValueInput to the example values container
		const exampleValuesContainer = fieldWrapper.find("> .prompt-default-example-wrapper > .default-example-wrapper > .example-values-container");
		exampleValuesContainer.append(exampleValueInput);

		// Initialize the example value in the backend object only if pushToBackend is true
		if (pushToBackend) {
			this.getFieldDataById(fieldId).exampleValues.push(exampleValue);
		}

		this.updateExampleValueIndices(fieldId);
	}

	/**
	 * Updates the example value in the backend object.
	 * @param {string} fieldId - The ID of the field being updated.
	 * @param {string} value - The new example value.
	 * @param {number} index - The index of the example value in the array.
	 */
	updateExampleValue(fieldId, value, index) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData && fieldData.exampleValues && index < fieldData.exampleValues.length) {
			fieldData.exampleValues[index] = value;
			debug(`Updated example value at index ${index} for field ID: ${fieldId}`);
		} else {
			error(`Invalid fieldId or index during example value update. Field ID: ${fieldId}, Index: ${index}`);
		}
	}

	/**
	 * Updates the indices of all example value inputs for a specific field after removal.
	 * @param {string} fieldId - The ID of the field.
	 */
	updateExampleValueIndices(fieldId) {
		const fieldWrapper = this.element.find(`[data-field-id="${fieldId}"]`);
		const exampleValueInputs = fieldWrapper.find("> .prompt-default-example-wrapper > .default-example-wrapper > .example-values-container input.text_pole");
		exampleValueInputs.each((i, input) => {
			$(input).data("index", i);
		});
	}

	/**
	 * Synchronizes the backend object with the current state of the component.
	 */
	syncBackendObject() {
		// Backend object is updated in real-time, so we just log and trigger the save callback.
		debug("Backend object synchronized.");
		this.triggerSaveCallback();
	}

	/**
	 * Triggers the save callback function with the current backend object.
	 */
	triggerSaveCallback() {
		this.onTrackerPromptSave(this.backendObject);
		debug("Save callback triggered.");
	}

	/**
	 * Populates the component with data from an existing object and rebuilds the UI.
	 * @param {Object} existingObject - The existing JSON object.
	 */
	populateFromExistingObject(existingObject) {
		try {
			// Clear existing backend object and reset field counter
			this.backendObject = {};
			this.fieldCounter = 0;
			this.exampleCounter = 0;

			const collectExampleCount = (obj) => {
				Object.values(obj).forEach((field) => {
					if (field.exampleValues.length > this.exampleCounter) {
						this.exampleCounter = field.exampleValues.length;
					}
					if (field.nestedFields && Object.keys(field.nestedFields).length > 0) {
						collectExampleCount(field.nestedFields);
					}
				});
			};
			collectExampleCount(existingObject);

			const normalizeExampleCount = (obj) => {
				Object.values(obj).forEach((field) => {
					while (field.exampleValues.length < this.exampleCounter) {
						field.exampleValues.push("");
					}
					if (field.nestedFields && Object.keys(field.nestedFields).length > 0) {
						normalizeExampleCount(field.nestedFields);
					}
				});
			};
			normalizeExampleCount(existingObject);

			// Rebuild the UI
			this.buildUI();

			// Build fields from the existing object
			this.buildFieldsFromObject(existingObject, null, null);

			// Make top-level container sortable
			this.makeFieldsSortable(this.fieldsContainer, this.backendObject);

			this.rebuildMiniNav();

			debug("Populated from existing object.");
		} catch (err) {
			error("Error populating from existing object:", err);
			toastr.error("Failed to load data.");
		}
	}

	/**
	 * Recursively builds fields from the existing object and updates the UI.
	 * @param {Object} obj - The object to build fields from.
	 * @param {Object|null} parentObject - The parent object in the backendObject.
	 * @param {string|null} parentFieldId - The ID of the parent field if any.
	 */
	buildFieldsFromObject(obj, parentObject, parentFieldId = null) {
		Object.entries(obj).forEach(([fieldId, fieldData]) => {
			// Use the appropriate parent object
			const currentParentObject = parentObject ? parentObject : this.backendObject;
			// Add the field (isNewField = false because we're loading existing data)
			this.addField(currentParentObject, parentFieldId, fieldData, fieldId, false);
		});
	}

	/**
	 * Returns the root HTML element of the component for embedding.
	 * @returns {jQuery} - The root element of the component.
	 */
	getElement() {
		return this.element;
	}

	/**
	 * Rebuilds the backend object from the current DOM order, ensuring keys match the order.
	 * This is called after sorting or after removal of fields to ensure keys reflect new order.
	 */
	rebuildBackendObjectFromDOM() {
		// Reset a global rebuild counter
		let rebuildCounter = 0;

		const rebuildObject = (container) => {
			const newObject = {};
			container.children(".field-wrapper").each((_, fieldEl) => {
				const $fieldEl = $(fieldEl);

				// Use the global rebuildCounter rather than the index
				const fieldId = `field-${rebuildCounter++}`;

				const fieldName = $fieldEl.find(".field-name-wrapper input").val() || "";
				const presence = $fieldEl.find(".presence-wrapper select").val() || "DYNAMIC";
				const scope = $fieldEl.find(".scope-wrapper select").val() || "BOTH";
				const fieldType = $fieldEl.find(".field-type-wrapper select").val() || "STRING";
				const prompt = $fieldEl.find(".prompt-wrapper textarea").val() || "";
				const defaultValue = $fieldEl.find(".default-value-wrapper input").val() || "";

				const exampleValues = [];
				$fieldEl.find("> .prompt-default-example-wrapper > .default-example-wrapper > .example-values-container input").each((__, inp) => {
					exampleValues.push($(inp).val() || "");
				});

				// Rename the data-field-id attribute to maintain consistency
				$fieldEl.attr("data-field-id", fieldId);

				// Rebuild nested fields recursively
				const $nestedContainer = $fieldEl.find("> .nested-fields-container");
				let nestedFields = {};
				if ($nestedContainer.length > 0 && $nestedContainer.children(".field-wrapper").length > 0) {
					nestedFields = rebuildObject($nestedContainer);
				}

				newObject[fieldId] = {
					name: fieldName,
					type: fieldType,
					presence: presence,
					scope: scope,
					prompt: prompt,
					defaultValue: defaultValue,
					exampleValues: exampleValues,
					nestedFields: nestedFields,
				};
			});
			return newObject;
		};

		// Rebuild the entire backend object using the global counter
		this.backendObject = rebuildObject(this.fieldsContainer);

		const keepSelectedEls = this.element.find(".field-wrapper[data-keep-selected='1']");
		this.selectedFieldIds.clear();
		if (keepSelectedEls.length > 0) {
			keepSelectedEls.each((_, el) => {
				const fieldId = $(el).attr("data-field-id");
				if (fieldId) {
					this.selectedFieldIds.add(fieldId);
				}
				$(el).removeAttr("data-keep-selected");
			});
		}
		this.clipboardFieldData = this.clipboardFieldData ? this.clipboardFieldData : null;
		this.element.find(".field-wrapper").each((_, el) => this.applyMultiSelectState($(el)));
		this.updateBulkButtonsState();

		// Update fieldCounter to one plus the highest index found
		this.fieldCounter = rebuildCounter;

		// Update exampleCounter (max of any field's exampleValues length)
		let maxExampleCount = 0;
		const findMaxExamples = (obj) => {
			Object.values(obj).forEach((f) => {
				if (f.exampleValues.length > maxExampleCount) {
					maxExampleCount = f.exampleValues.length;
				}
				if (f.nestedFields && Object.keys(f.nestedFields).length > 0) {
					findMaxExamples(f.nestedFields);
				}
			});
		};
		findMaxExamples(this.backendObject);
		this.exampleCounter = maxExampleCount;

		debug("Rebuilt backend object from DOM.", { backendObject: this.backendObject });

		this.syncBackendObject();
		this.rebuildMiniNav();
	}
}
