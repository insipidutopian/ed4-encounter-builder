
export default function registerLibwrappers() {

	// libWrapper.register(CONSTANTS.MODULE_NAME, 'Token.prototype._onClickLeft2', function (wrapped, ...args) {
	// 	if (PileUtilities.isValidItemPile(this.document) && hotkeyActionState.openPileInventory) {
	// 		return PrivateAPI._itemPileClicked(this.document);
	// 	}
	// 	return wrapped(...args);
	// }, "MIXED");

	// const versionIsEleven = foundry.utils.isNewerVersion(game.version, "10.999");

	// const overrideMethod = versionIsEleven
	// 	? `DocumentDirectory.prototype._onClickEntryName`
	// 	: `SidebarDirectory.prototype._onClickDocumentName`;

	// libWrapper.register(CONSTANTS.MODULE_NAME, overrideMethod, function (wrapped, event) {
	// 	event.preventDefault();
	// 	const element = event.currentTarget;
	// 	if (!(this instanceof Compendium)) {
	// 		const documentId = element.parentElement.dataset.documentId;
	// 		const document = this.constructor.collection.get(documentId);
	// 		if (PileUtilities.isValidItemPile(document)) {
	// 			const hookResult = Helpers.hooks.call(CONSTANTS.HOOKS.PILE.PRE_DIRECTORY_CLICK, document);
	// 			if (hookResult === false) return false;
	// 		}
	// 	}
	// 	return wrapped(event);
	// }, "MIXED");

	// Hooks.on(CONSTANTS.HOOKS.PRE_RENDER_SHEET, (doc, forced, options) => {
	// 	const renderItemPileInterface = forced && !options?.bypassItemPiles && PileUtilities.isValidItemPile(doc) && hotkeyActionState.openPileInventory;
	// 	if (!renderItemPileInterface) return;
	// 	game.itempiles.API.renderItemPileInterface(doc, { useDefaultCharacter: true });
	// 	return false;
	// })

	// libWrapper.register(CONSTANTS.MODULE_NAME, `ActorSheet.prototype.render`, function (wrapped, forced, options, ...args) {
	// 	const renderItemPileInterface = Hooks.call(CONSTANTS.HOOKS.PRE_RENDER_SHEET, this.document, forced, options) === false;
	// 	if (this._state > Application.RENDER_STATES.NONE) {
	// 		if (renderItemPileInterface) {
	// 			wrapped(forced, options, ...args)
	// 		} else {
	// 			return wrapped(forced, options, ...args)
	// 		}
	// 	}
	// 	if (renderItemPileInterface) return;
	// 	return wrapped(forced, options, ...args);
	// }, "MIXED");

	libWrapper.register("ed4-encounter-builder", "DragDrop.prototype.callback", function (wrapped, event, type) {
		const result = wrapped(event, type)
		const hookType = {
			"dragstart": `ed4-encounter-builder-onDragDocument`,
			"drop": `ed4-encounter-builder-onDropDocument`,
		}[type] ?? false;
		if (hookType) {
			try {
				const value = JSON.parse(event.dataTransfer.getData("text/plain"));
				Hooks.callAll(hookType, value);
			} catch (err) {
			}
		}
		return result;
	}, "WRAPPER")	

	// if (SYSTEMS.DATA.SHEET_OVERRIDES) {
	// 	SYSTEMS.DATA.SHEET_OVERRIDES();
	// }

}
