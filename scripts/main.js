CONFIG.debug.hooks = true;


/**
 * A single Encounter in our list of Encounters.
 * @typedef {Object} Encounter
 * @property {string} id - A unique ID to identify this encounter.
 * @property {string} name - The name of the encounter.
 * @property {boolean} isDone - Marks whether the encounter is complete.
 * @property {string} description - A description of the encounter.
 */


/**
 * A single Creature in our Encounter.
 * @typedef {Object} Creature
 * @property {string} id - A unique ID to identify this creature.
 * @property {string} name - The name of the creature.
 * @property {boolean} isDone - Marks whether the encounter is complete.
 * @property {string} description - A description of the encounter.
 * @property {number} circle - the circle (difficulty) of the creature.
 */

class Ed4EncounterBuilder {
  static ID = 'ed4-encounter-builder';

  /* DANGER !!!!!!!!!!!!!!!!!! */
  static DEBUG = true;
  /* DANGER !!!!!!!!!!!!!!!!!! */

  static FLAGS = {
    ED4ENCOUNTERBUILDER: 'ed4-encounter-builder'
  }

  static SETTINGS = {
    INJECT_BUTTON: 'inject-button'
  }
  
  static TEMPLATES = {
    ENCLIST: `modules/${this.ID}/templates/ed4-encounter-list.hbs`,
    ENCBUILDER: `modules/${this.ID}/templates/ed4-encounter-builder.hbs`
  }


  static log(force, ...args) {  
    const shouldLog = force || game.modules.get('_dev-mode')?.api?.getPackageDebugValue(this.ID);

    if (shouldLog || this.DEBUG === true) {
      console.log(this.ID, '|', ...args);
    }
  }

  static compendiums = { // Support GM's Guide                  Companion,                                 Panda Bestiary,                             ?Travar?,                     Iopos,                         and ?Vasgothia?
    "Creatures":       [ "earthdawn-gm-compendium.creatures",  /*"earthdawn-companion.companion-creatures",*/ "earthdawn-panda-bestiary.panda-bestiary",  "ed-travar.travar-creatures",                                "vasgothia.creatures-vasgothia" ],
    "Masks":           [                                       "earthdawn-companion.masks",                                                                                         "earthdawn-iopos.masks-iopos", "vasgothia.masks-vasgothia"]
  }
  static compendiumsNeedToBeLoaded = true;
  static compendiumsLoaded = [];
  static adversaries = [];

  static initialize() {
    //this.ed4EncounterListForm = new Ed4EncounterListForm();

    game.settings.register(this.ID, this.SETTINGS.INJECT_BUTTON, {
      name: `ED4-ENCOUNTERBUILDER.settings.${this.SETTINGS.INJECT_BUTTON}.Name`,
      default: true,
      type: Boolean,
      scope: 'client',
      config: true,
      onChange: () => ui.sidebar.render(),
      hint: `ED4-ENCOUNTERBUILDER.settings.${this.SETTINGS.INJECT_BUTTON}.Hint`
    });

    Ed4EncounterBuilder.log(false, "initialize() called");

    this.encounterListForm = new EncounterListForm();
    this.encounterBuilderForm = new EncounterBuilderForm();

    /* Its actually possibly too early to load compendiums - they might not be loaded yet.... */
    //Ed4EncounterBuilder.loadCompendiums();
  }

  static loadCompendiums(forceFlag = false) {
    if (forceFlag || this.compendiumsNeedToBeLoaded) {
      this.adversaries = [];
      Ed4EncounterBuilder.log(false, "loading compendiums");
      for (let i = 0; i < this.compendiums["Creatures"].length; i++) {
        Ed4EncounterBuilder.log(false, "Checking for compendium " + this.compendiums["Creatures"][i]);
        if (game.packs.has(this.compendiums["Creatures"][i])) {
          Ed4EncounterBuilder.log(false, "Attempting to load compendium...");
          this.loadCompendium(this.compendiums["Creatures"][i]);
        }
      }
      while (this.compendiumsLoaded.includes(false)) {
        this.sleep(500).then(() => {
         Ed4EncounterBuilder.log(false, "Compendiums loading...");
        });
      }
      Ed4EncounterBuilder.log(false, "done loading compendiums");
      this.compendiumsNeedToBeLoaded = false;
    } else {
      Ed4EncounterBuilder.log(false, "skipped loading compendiums: ff: " + forceFlag + ", cn2bl: " + this.compendiumsNeedToBeLoaded);
    }
  }

  static async _getCompendiumItem(compendiumName, itemName) {
    try {
      const pack = game.packs.get(compendiumName);
      const itemID = pack.index.getName(itemName)._id;
      const item = await pack.getDocument(itemID);
      return game.items.fromCompendium(item);
    } catch (e) {
      Ed4EncounterBuilder.log(false, "Error fetching item {} from compendium {}", itemName, compendiumName);
      return {};
    }
  }

  static async _getCompendiumPack(compendiumName) {
    try {
      const pack = game.packs.get(compendiumName);
      Ed4EncounterBuilder.log(false, "Pack has ", game.packs.get(compendiumName).folders.size , " folders");
      return pack;
    } catch (e) {
      Ed4EncounterBuilder.log(false, "Missing Compendium: " + compendiumName)
      return {};
    }
  }

  static loadCompendium(compendiumName) {
    try {
      Ed4EncounterBuilder.log(false, "Loading {} compendium pack", compendiumName)
      const pack = this._getCompendiumPack(compendiumName);
      this.compendiumsLoaded[compendiumName] = false;
      var compendiumCreatureCount = 0;
      if (pack) {
        Ed4EncounterBuilder.log(false, "got a pack");

        for ( const c of Array.from(game.packs.get(compendiumName).index)) {
          Ed4EncounterBuilder.log(false, "found " + c.name + ", id" + c.id + " ...");
          this._getCompendiumItem(compendiumName, c.name).then(i => {
            if (compendiumCreatureCount < 3) {
              Ed4EncounterBuilder.log(false, "Found sample creature -> name: " + i.name + ", CR: " + i.system.challenge);
            }
            c._comp = compendiumName;
            this.addCompendiumItemToAdversaries(c._id, i, compendiumName);
          });
          compendiumCreatureCount += 1;
        }
      }
    } catch (e) {
      Ed4EncounterBuilder.log(false, "Unable to load {} compendium", compendiumName, ":")
      Ed4EncounterBuilder.log(false, e);
    }
    
    Ed4EncounterBuilder.log(false, "compendium contained " + compendiumCreatureCount + " creatures.");
    this.compendiumsLoaded[compendiumName] = true;
  }


  static addCompendiumItemToAdversaries(id, creature, compendium) {
    creature = { name: creature.name, challenge: creature.system.challenge, id: id, type: creature.type, img: creature.img, compendium: compendium};
    this.adversaries.push(creature);
  }

  static createTheCreateEncounterButton(html) {
    if (!game.settings.get(Ed4EncounterBuilder.ID, Ed4EncounterBuilder.SETTINGS.INJECT_BUTTON)) {
      return;
    }
    
    Ed4EncounterBuilder.log(false, "Trying to add Create Encounter Button");
    if (!!document.getElementById("create-button-encounter-builder")) return;

    Ed4EncounterBuilder.log(false, "Adding Create Encounter Button");

    // create localized tooltip
    const tooltip = game.i18n.localize('ED4-ENCOUNTERBUILDER.button-title');

    html.find('.header-actions').append(
      `<button type='button' class='encounter-builder-icon-button flex0' title='${tooltip}'><i class='fas fa-spider'></i></button>`);

    html.on('click', '.encounter-builder-icon-button', (event) => {
      Ed4EncounterBuilder.log(true, 'Button Clicked!');
      Ed4EncounterBuilder.encounterListForm.render(true, { userId: game.userId});
    });

    Ed4EncounterBuilder.log(false, "Added Create Encounter Button");
  }


  static get getPcs() {
    const pcsList =  game.actors.filter(p => p.type == 'pc').filter(p => canvas.tokens.placeables.find(c => c.name == p.prototypeToken.name))
    pcsList.forEach((pc) => Ed4EncounterBuilder.calculatePcEffectiveCircle(pc));
    return pcsList;
  }

  static setEd4FlagOnActor(actor, flagName, flagValue) {
    if (!actor['flags'][Ed4EncounterBuilder.ID])
      actor['flags'][Ed4EncounterBuilder.ID] = {};

    actor['flags'][Ed4EncounterBuilder.ID][flagName] = flagValue;
  }


  static getPcAndCalculateEC(pcId) {

    const pcs = this.getPcs;


    const pc = pcs.find((pc) => pc.id == pcId);

    this.calculatePcEffectiveCircle(pc);
    return pc.flags[Ed4EncounterBuilder.ID].effectiveCircle;
  } 


  static calculatePcEffectiveCircle(pc) {
    Ed4EncounterBuilder.log(false, "Calculating effective circle for " + pc.name + " with LP: " + pc.system.legendpointtotal)
    if (pc.system.legendpointtotal < 800)
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",1);
    else if (pc.system.legendpointtotal < 2300) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",2);
    else if (pc.system.legendpointtotal < 7000) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",3);
    else if (pc.system.legendpointtotal < 16500) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",4);
    else if (pc.system.legendpointtotal < 35000) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",5);
    else 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",6);
  }

} // Ed4EncounterBuilder class


/*
            Hooks

 */

Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(Ed4EncounterBuilder.ID, true);
  console.log("ed4-encounter-builder | registerPackageDebugFlag true");
});


Hooks.once('init', async function() {
	Ed4EncounterBuilder.log(false,  'ED4 Encounter Builder initializing!');
  Ed4EncounterBuilder.initialize();
  

  Ed4EncounterBuilder.log(false, "Registering Handlebars helpers");

  Handlebars.registerHelper('pcIsInEncounter', function (pcId, encounterId) {
    Ed4EncounterBuilder.log(false, `Checking encounter ${encounterId} for pc ${pcId}`);
    const allEncounters = EncounterData.allEncounters;
    if (allEncounters[encounterId]) {
      Ed4EncounterBuilder.log(false, `Checking encounter ${encounterId} for pc ${pcId}`);
      if (allEncounters[encounterId].pcs.find((pc) => pc.id == pcId))
        return true;
      else 
        return false;
    }
    return false;
  });

  Ed4EncounterBuilder.log(true,  'ED4 Encounter Builder initialized!');
});

// Hooks.once('init', () => {
//   Ed4EncounterBuilder.initialize();
// });

Hooks.on("renderSidebarTab", async (app, html) => {
    if (app.options.classes.includes("actors-sidebar")) {
        Ed4EncounterBuilder.log(false, "In Hook: renderSidebarTab");
        Ed4EncounterBuilder.createTheCreateEncounterButton(html)
    }
})


/*
          EncounterData Class

 */

/**
 * The encounter storage for our encounter builder module
 */
class EncounterData {
  /**
   * get all Encounters for all users indexed by the encounter's id
   */
  static get allEncounters() {
    const allEncounters = game.users.reduce((accumulator, user) => {
      const userEncounters = this.getEncountersForUser(user.id);

      return {
        ...accumulator,
        ...userEncounters
      }
    }, {});

    return allEncounters;
  }

  static clearAllEncounters() {
    game.users.get(game.userId)?.setFlag(Ed4EncounterBuilder.ID, Ed4EncounterBuilder.FLAGS.ED4ENCOUNTERBUILDER, []);
  }

  static filter = "";

  static get allAdversaries() {
    Ed4EncounterBuilder.loadCompendiums(false);

    return Ed4EncounterBuilder.adversaries;
  }

  static get filteredAdversaries() {
    
    return Ed4EncounterBuilder.adversaries.filter((creature) => creature.name.toUpperCase().includes(this.filter.toUpperCase()));
  }


  /**
   * Gets all of a given user's Encounters
   * 
   * @param {string} userId - id of the user whose Encounters to return
   * @returns {Record<string, encounter> | undefined}
   */
  static getEncountersForUser(userId) {
    return game.users.get(userId)?.getFlag(Ed4EncounterBuilder.ID, Ed4EncounterBuilder.FLAGS.ED4ENCOUNTERBUILDER);
  }

  /**
   * 
   * @param {string} userId - id of the user to add this encounter to
   * @param {Partial<encounter>} encounterData - the encounter data to use
   */
  static createEncounter(userId, encounterData) {
    // generate a random id for this new encounter and populate the userId
    const newencounter = {
      isDone: false,
      label: '',
      description: '',
      environment: '',
      tactics: '',
      difficultyRating: "simple",
      ...encounterData,
      id: foundry.utils.randomID(16),
      userId,
      pcs: [],
      enemies: [],
    }

    // construct the update to insert the new encounter
    const newEncounters = {
      [newencounter.id]: newencounter
    }

    // update the database with the new Encounters
    return game.users.get(userId)?.setFlag(Ed4EncounterBuilder.ID, Ed4EncounterBuilder.FLAGS.ED4ENCOUNTERBUILDER, newEncounters);
  }

  static getEncounter(userId, encounterId) {
    const relevantEncounter = this.allEncounters[encounterId];

    // update the database with the new Encounters
    return game.users.get(userId)?.getFlag(Ed4EncounterBuilder.ID, Ed4EncounterBuilder.FLAGS.ED4ENCOUNTERBUILDER, relevantEncounter);
  }


  /**
   * Updates a given encounter with the provided data.
   * 
   * @param {string} encounterId - id of the encounter to update
   * @param {Partial<encounter>} updateData - changes to be persisted
   */
  static updateEncounter(encounterId, updateData) {
    const relevantencounter = this.allEncounters[encounterId];

    // construct the update to send
    const update = {
      [encounterId]: updateData
    }

    // update the database with the updated encounter list
    return game.users.get(relevantencounter.userId)?.setFlag(Ed4EncounterBuilder.ID, Ed4EncounterBuilder.FLAGS.ED4ENCOUNTERBUILDER, update);
  }

  /**
   * Saves an encounter's data
   */

  static saveEncounter(encounterId, updateData) {
    Ed4EncounterBuilder.log(false, "saveEncounter: e=" +  updateData);
    const relevantencounter = this.allEncounters[encounterId];
    return game.users.get(relevantencounter.userId)?.setFlag(Ed4EncounterBuilder.ID, Ed4EncounterBuilder.FLAGS.ED4ENCOUNTERBUILDER, updateData);
  }
  /**
   * Deletes a given encounter
   * 
   * @param {string} encounterId - id of the encounter to delete
   */
  static deleteEncounter(encounterId) {
    const relevantencounter = this.allEncounters[encounterId];

    // Foundry specific syntax required to delete a key from a persisted object in the database
    const keyDeletion = {
      [`-=${encounterId}`]: null
    }

    // update the database with the updated encounter list
    return game.users.get(relevantencounter.userId)?.setFlag(Ed4EncounterBuilder.ID, Ed4EncounterBuilder.FLAGS.ED4ENCOUNTERBUILDER, keyDeletion);
  }

  /**
   * Updates the given user's Encounters with the provided updateData. This is
   * useful for updating a single user's Encounters in bulk.
   * 
   * @param {string} userId - user whose Encounters we are updating
   * @param {object} updateData - data passed to setFlag
   * @returns 
   */
  static updateUserEncounters(userId, updateData) {
    return game.users.get(userId)?.setFlag(Ed4EncounterBuilder.ID, Ed4EncounterBuilder.FLAGS.ED4ENCOUNTERBUILDER, updateData);
  }
} // EncounterData class


/*
            EncounterListForm

 */

class EncounterListForm extends FormApplication {

  static get defaultOptions() {
    const defaults = super.defaultOptions;
    
    const overrides = {
      height: 'auto',
      id: 'encounter-list',
      template: Ed4EncounterBuilder.TEMPLATES.ENCLIST,
      title: 'Encounters',
      userId: game.userId,
      width: "400",
      height: "auto",
      closeOnSubmit: false, // do not close when submitted
      submitOnChange: true, // submit when any input changes
    };

    const mergedOptions = foundry.utils.mergeObject(defaults, overrides);
    

    return mergedOptions;
  }


  getData(options) {
    return {
      encounters: EncounterData.getEncountersForUser(options.userId),
      adversaries: EncounterData.allAdversaries,
    }
  }

  async _updateObject(event, formData) {

    const expandedData = foundry.utils.expandObject(formData);
    Ed4EncounterBuilder.log(false, 'EncounterListForm: saving', {
      formData,
      expandedData
    });
    await EncounterData.updateUserEncounters(this.options.userId, expandedData);

    this.render();
  }


  activateListeners(html) {
    super.activateListeners(html);
    html.on('click', "[data-action]", this._handleButtonClick.bind(this));
    //Ed4EncounterBuilder.log(false, 'Button Clicked!');
  }

  async _handleButtonClick(event) {
    const clickedElement = $(event.currentTarget);
    const action = clickedElement.data().action;
    const encounterId = clickedElement.parents('[data-encounter-list-id]')?.data()?.encounterListId;
    
    Ed4EncounterBuilder.log(false, 'EncounterListForm: Button Clicked!', {this: this, action, encounterId});
    switch (action) {
      case 'create': {
        await EncounterData.createEncounter(this.options.userId);
        this.render();
        break;
      }
      case 'build': {
        Ed4EncounterBuilder.encounterBuilderForm.render(true, { /* userId: this.options.userId, */ encounterId: encounterId});
        break;
      }
      case 'delete': {
        await EncounterData.deleteEncounter(encounterId);
        this.render();
        break;
      }

      default:
        Ed4EncounterBuilder.log(false, 'EncounterListForm: Invalid action detected', action);
    }
  }

} // EncounterListForm


/*
            EncounterBuilderForm

 */

class EncounterBuilderForm extends FormApplication {
  static get defaultOptions() {
    const defaults = super.defaultOptions;
    
    const overrides = {
      height: 'auto',
      id: 'build-encounter-form',
      template: Ed4EncounterBuilder.TEMPLATES.ENCBUILDER,
      title: 'Build Encounter',
      userId: game.userId,
      encounterId: null,
      height: 720,
      width: 800,
      closeOnSubmit: false, // do not close when submitted
      //submitOnChange: true, // submit when any input changes
    };

    const mergedOptions = foundry.utils.mergeObject(defaults, overrides);
    
    return mergedOptions;
  }

  static updateValue() {
    const clickedElement = $(event.currentTarget);
    const value = clickedElement[0]?.value;
    const fieldNameParts = clickedElement[0]?.name?.split('-');
    const fieldName = fieldNameParts[1];
    const encounterId = fieldNameParts[2];
    
    Ed4EncounterBuilder.log(false, `asked to update encounter ${fieldName} for enc ID: ${encounterId}`);
    const enc = EncounterData.getEncounter(game.userId, encounterId);
    if (enc && enc[encounterId]) {
      Ed4EncounterBuilder.log(false, `updating encounter description: ${fieldName} to: ${value}`);
      enc[encounterId][fieldName] = value;
      EncounterData.saveEncounter(encounterId, enc);
    }
    
  }
  

  static updateEnemyCount() {
    const clickedElement = $(event.currentTarget);
    const action = clickedElement.data().action;
    const encounterId = clickedElement.parents('[data-encounter-id]')?.data()?.encounterId;
    const adversaryId = clickedElement.parents('[data-encounter-adversary-id]')?.data()?.encounterAdversaryId;
    Ed4EncounterBuilder.log(false, "updating adversary count, adversary: " + adversaryId);
    var adversaryCount = clickedElement.parents('[data-encounter-adversary-id]')?.children()[0].value; //TODO is there a better way to do this
    Ed4EncounterBuilder.log(false, "this: ", this, " updating adversary count, count: " + adversaryCount);  

    const enc = EncounterData.getEncounter(game.userId, encounterId);
    if (enc && enc[encounterId]) {
      Ed4EncounterBuilder.log(false, `updating adversary id: ${adversaryId}, count: ${adversaryCount}`);
      var e = enc[encounterId].enemies.find(e => e.id == adversaryId)
      if (e) {
        e.count = adversaryCount;
        this.calculateEncounterDifficulty(encounterId);
        EncounterData.saveEncounter(encounterId, enc);
        //cause re-render
        Ed4EncounterBuilder.encounterBuilderForm.render(true, { encounterId: encounterId});
      }
    }
  }

  static calculateEncounterDifficultyRatingText(rating) {
    if (rating > 1.5)
      return "simple";
    if (rating > 1.2)
      return "easy";
    if (rating > 0.8)
      return "normal";
    if (rating > 0.5)
      return "hard";
    return "deadly";

  }

  static calculateEncounterDifficulty(encounterId) {
    Ed4EncounterBuilder.log(false, "calculating encounter difficulty: ", encounterId || this.options.encounterId);
    const enc = EncounterData.getEncounter(game.userId, encounterId || this.options.encounterId);
    if (enc && enc[encounterId]) {
      let i = 0;
      enc[encounterId].enemies.forEach((e) => { i += this.getChallengeNumberFromString(e.challenge, e.name) * e.count})
      let enemyStrength = i || 0.1;

      i = 0;
      enc[encounterId].pcs.forEach((pc) => { i += pc.effectiveCircle; });
      let partyStrength = i || 0.1;
      
      Ed4EncounterBuilder.log(false, ` party strength ${partyStrength} enemy strength ${enemyStrength}`);
      enc[encounterId].difficulty = partyStrength / enemyStrength;
      enc[encounterId].difficultyRating = this.calculateEncounterDifficultyRatingText(enc[encounterId].difficulty);
      

      Ed4EncounterBuilder.log(false, "encounter difficulty: ", enc[encounterId].difficulty);
    }
  }

  static getChallengeNumberFromString(challenge, name) {
    if (!challenge) {
      if (name?.toUpperCase().includes("SR")){
        Ed4EncounterBuilder.log(false, `encounter difficulty of ${name}: ` + Number(name.slice(name?.indexOf("SR")+3)));
        return Number(name.slice(name?.indexOf("SR")+3));
      }
      return 1;
    }
    if (challenge?.toLowerCase().includes("fifteen") || challenge?.includes("15"))
      return 15;
    if (challenge.toLowerCase().includes("fourteen") || challenge.includes("14"))
      return 14;
    if (challenge.toLowerCase().includes("thirteen") || challenge.includes("13"))
      return 13;
    if (challenge.toLowerCase().includes("twel") || challenge.includes("12"))
      return 12;
    if (challenge.toLowerCase().includes("eleven") || challenge.includes("11"))
      return 11;
    if (challenge.toLowerCase().includes("ten") || challenge.includes("10"))
      return 10;
    if (challenge.toLowerCase().includes("nin") || challenge.includes("9"))
      return 9;
    if (challenge.toLowerCase().includes("eight") || challenge.includes("8"))
      return 8;
    if (challenge.toLowerCase().includes("seven") || challenge.includes("7"))
      return 7;
    if (challenge.toLowerCase().includes("six") || challenge.includes("6"))
      return 6;
    if (challenge.toLowerCase().includes("fifth") || challenge.toLowerCase().includes("five") || challenge.includes("5"))
      return 5;
    if (challenge.toLowerCase().includes("four") || challenge.includes("4"))
      return 4;
    if (challenge.toLowerCase().includes("three") || challenge.toLowerCase().includes("third") || challenge.includes("3"))
      return 3;
    if (challenge.toLowerCase().includes("two") || challenge.toLowerCase().includes("second") || challenge.includes("2"))
      return 2;

    return 1;
  }
  getData(options) {
    Ed4EncounterBuilder.log(false, 'BuildEncounterForm: getData() called');

    return { 
      encounter: EncounterData.allEncounters[this.options.encounterId],
      adversaries: EncounterData.allAdversaries,
      filteredAdversaries: EncounterData.filteredAdversaries,
      allpcs: Ed4EncounterBuilder.getPcs,
    }
  }

  async _updateObject(event, formData) {

    const expandedData = foundry.utils.expandObject(formData);
    Ed4EncounterBuilder.log(false, 'BuildEncounterForm: saving', {
      formData,
      expandedData
    });
    Ed4EncounterBuilder.log(false, 'BuildEncounterForm: saving', expandedData.encounter.description);
    //expandedData[this.options.encounterId][this.options.encounterId].description = expandedData.encounter.description;
    await EncounterData.updateUserEncounters(this.options.userId, expandedData[this.options.encounterId]);

    this.render();
  }

  static _handleFilter(event) {
    console.log(event);
    console.log("filter text is: " + event.srcElement.value);
    EncounterData.filter = event.srcElement.value;
    
    const adversariesRowEls = event.srcElement.parentNode.parentNode.querySelectorAll("li.ed4-encounter-builder-griditem");
    for (const el of adversariesRowEls) {
      if (EncounterData.filteredAdversaries.find((element) => element.id === el.dataset.encounterAdversaryId) ) { 
        el.classList.remove("hidden");
        Ed4EncounterBuilder.log(false, "setting " + el.dataset.encounterAdversaryId + " to visible");
      } else {
        el.classList.add("hidden");
      }
    }
  }


  activateListeners(html) {
    super.activateListeners(html);
    html.on('click', "[data-action]", this._handleButtonClick.bind(this));
    //Ed4EncounterBuilder.log(false, 'Button Clicked!');
  }

  async _handleButtonClick(event) {
    const clickedElement = $(event.currentTarget);
    const action = clickedElement.data().action;
    const encounterId = clickedElement.parents('[data-encounter-list-id]')?.data()?.encounterBuilderId;
    const adversaryId = clickedElement.parents('[data-encounter-adversary-id]')?.data()?.encounterAdversaryId;
    
    var enc;
    
    Ed4EncounterBuilder.log(false, 'BuildEncounterForm: Button Clicked!', {this: this, action, encounterId, adversaryId});
    switch (action) {
      case 'done': 
        this.close();
        break;

      case "change-enemy-count":
      case "count":
        Ed4EncounterBuilder.log(false, "**updating adversary count, adversary: " + adversaryId);
        var adversaryCount = clickedElement.parents('[data-encounter-adversary-id]')?.children()[0].value; //TODO is there a better way to do this
        Ed4EncounterBuilder.log(false, "**updating adversary count, count: " + adversaryCount);  
        //EncounterBuilderForm.calculateEncounterDifficulty();
        this.render({});
        break;
      case 'remove':
        enc = EncounterData.getEncounter(this.options.userId, this.options.encounterId);
        if (enc && enc[this.options.encounterId]) {
          Ed4EncounterBuilder.log(false, 'removing enemy from encounter');
          enc[this.options.encounterId].enemies = enc[this.options.encounterId].enemies.filter((enemy) => enemy.id != adversaryId);
          Ed4EncounterBuilder.log(false, "enemies now: ", enc[this.options.encounterId].enemies);
          //EncounterData.saveEncounter(this.options.encounterId, enc);
        }
        EncounterBuilderForm.calculateEncounterDifficulty(this.options.encounterId);
        this.render({});
        break;
      case 'add': 
        var adversaryCount = clickedElement.parents('[data-encounter-adversary-id]')?.children()[0].value; //TODO is there a better way to do this
        Ed4EncounterBuilder.log(false, "Adding " + adversaryCount + " of adversary: " + adversaryId + " to encounter " + this.options.encounterId);
        enc = EncounterData.getEncounter(this.options.userId, this.options.encounterId);
        if (enc && enc[this.options.encounterId]) {
          Ed4EncounterBuilder.log(false, 'pushing enemy to list');
          const found = Ed4EncounterBuilder.adversaries.find((a) => a.id === adversaryId);
          if (found) {
            enc[this.options.encounterId].enemies.push( {id: adversaryId, 
                                                         name: found.name,
                                                         img: found.img, 
                                                         challenge: found.challenge, 
                                                         count: adversaryCount} );
            EncounterData.saveEncounter(this.options.encounterId, enc);
          }
        }
        EncounterBuilderForm.calculateEncounterDifficulty(this.options.encounterId);
        this.render({});
        break;

      case 'toggle-pc':
        const pcId = clickedElement.parents('[data-encounter-pc-id]')?.data()?.encounterPcId;
    
        Ed4EncounterBuilder.log(false, "Adding or removing PC id: " + pcId);
        enc = EncounterData.getEncounter(this.options.userId, this.options.encounterId);
        if (enc && enc[this.options.encounterId]) {
          if (enc[this.options.encounterId].pcs.find((pc) => pc.id == pcId)) {
            enc[this.options.encounterId].pcs = enc[this.options.encounterId].pcs.filter(p => p.id != pcId)
          } else {
            enc[this.options.encounterId].pcs.push( {id: pcId, effectiveCircle: Ed4EncounterBuilder.getPcAndCalculateEC(pcId)});
          }
          EncounterData.saveEncounter(this.options.encounterId, enc);
        }
        EncounterBuilderForm.calculateEncounterDifficulty(this.options.encounterId);
        this.render({});
        break;
      case 'view-adversary': 
        Ed4EncounterBuilder.log(false, "Viewing adversary id: " + adversaryId);
        const found = Ed4EncounterBuilder.adversaries.find((a) => a.id === adversaryId);
        if (found) {
          Ed4EncounterBuilder.log(false, "Found adversary id: " + adversaryId + " in adversary list");
          const compendiumName = found.compendium;     
          const document = game.packs.get(compendiumName).get(adversaryId) ?? await this.collection.getDocument(adversaryId);
          document.sheet.render(true);
        }
        break;
      
      // case 'delete': {
      //   await EncounterData.deleteEncounter(encounterId);
      //   this.render();
      //   break;
      // }

      default:
        Ed4EncounterBuilder.log(false, 'BuildEncounterForm: Invalid action detected', action);
    }
  }

} //EncounterBuilderForm

