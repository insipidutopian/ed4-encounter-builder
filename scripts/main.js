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

  static compendiumsNeedToBeLoaded = true;
  static compendiumsLoaded = [];
  static adversaries = [];

  static initialize() {
    Ed4EncounterBuilder.log(false, "initialize() called");

    Hooks.on("renderCombatTracker", (app, element, context, options) => {
      Ed4EncounterBuilder.log(false, "renderCombatTracker hook called");
      // 1. Check if our button already exists to prevent duplicates on re-render
      if (element.querySelector(".encounter-designer-btn")) return;
      Ed4EncounterBuilder.log(false, "creating encounter designer button");

      // 2. Find the footer or action area inside the combat tab content
      const footer = element.querySelector(".directory-footer") || element.querySelector("footer") || element.querySelector(".encounters-footer");
      const targetArea = footer || element.querySelector(".tab-content") || element;

      // 3. Create the wide button element
      const designerBtn = document.createElement("button");
      designerBtn.type = "button";
      
      // Use flexbox and justify-content center to center the text and icon
      designerBtn.classList.add("combat-button","encounter-designer-btn"); 
      designerBtn.style.display = "flex";
      designerBtn.style.alignItems = "center";
      designerBtn.style.justifyContent = "center";
      designerBtn.style.gap = "8px"; // Space between icon and text
      
      // Add margin/padding so it doesn't slam against the edges of the sidebar
      designerBtn.style.width = "calc(100% - 16px)";
      designerBtn.style.margin = "8px auto";
      designerBtn.style.padding = "6px 12px";

      // Add an icon and the requested text
      const buttonText = game.i18n.localize("ED4-ENCOUNTERBUILDER.button-title");
      designerBtn.innerHTML = `<i class="fas fa-swords"></i> ${buttonText}`;

      // 4. Attach your click listener
      designerBtn.addEventListener("click", (event) => {
          event.preventDefault();
          Ed4EncounterBuilder.log(false, "Encounter Designer button clicked!");
          
          // Open the Encounter List Form UI
          if (Ed4EncounterBuilder.encounterListForm) {
              Ed4EncounterBuilder.encounterListForm.render(true, { userId: game.userId });
          } else {
              new EncounterListForm().render(true, { userId: game.userId });
          }
      });

      // 5. Append the button to the bottom of the tab layout
      targetArea.append(designerBtn);
    }); 
    Ed4EncounterBuilder.log(false, "registered ED4 Encounter Builder Sidebar button...");


    this.encounterListForm = new EncounterListForm();
    this.encounterBuilderForm = new EncounterBuilderForm();

    /* Its actually possibly too early to load compendiums - they might not be loaded yet.... */
    //Ed4EncounterBuilder.loadCompendiums();
  }

  //spawn
static async spawnEncounterTokens(encounterId) {
  const encounter = EncounterData.allEncounters?.[encounterId];
  Ed4EncounterBuilder.log(false, `[Spawn] ==================== START SPAWN/SYNC ====================`);

  if (!encounter) {
    ui.notifications.warn("Encounter not found.");
    return [];
  }

  const activeScene = canvas.scene || game.scenes.viewed;
  if (!activeScene) {
    ui.notifications.warn("No active scene found to check tokens on.");
    return [];
  }

  // Map out scene tokens by actor reference and name for tracking
  const sceneActorCounts = new Map(); // Key: identifier, Value: count
  const sceneTokensByActor = new Map(); // Key: identifier, Value: array of token documents

  if (activeScene.tokens) {
    for (const tokenDoc of activeScene.tokens) {
      const identifiers = new Set();
      if (tokenDoc.actorId) identifiers.add(tokenDoc.actorId);
      if (tokenDoc.actor?.id) identifiers.add(tokenDoc.actor.id);
      
      const docUuid = tokenDoc.actor?.uuid || tokenDoc.uuid || tokenDoc._source?.actorId;
      if (docUuid) identifiers.add(docUuid);

      if (tokenDoc.name) {
        const cleanName = tokenDoc.name.replace(/\([^)]*\)/g, '').trim().toLowerCase();
        identifiers.add(cleanName);
      }

      for (const idKey of identifiers) {
        sceneActorCounts.set(idKey, (sceneActorCounts.get(idKey) || 0) + 1);
        
        if (!sceneTokensByActor.has(idKey)) {
          sceneTokensByActor.set(idKey, []);
        }
        // Avoid duplicate entry if multiple identifiers match the same tokenDoc
        const tokenList = sceneTokensByActor.get(idKey);
        if (!tokenList.includes(tokenDoc)) {
          tokenList.push(tokenDoc);
        }
      }
    }
  }

  const spawnedTokensData = [];
  const tokenIdsToRemove = [];
  let xOffset = 100;
  let yOffset = 100;

  async function processActorToken(rawId, requestedCount = 1) {
    let actor = game.actors.get(rawId) || (await fromUuid(rawId));

    if (!actor) {
      for (let pack of game.packs.values()) {
        if (pack.documentName === "Actor") {
          try {
            actor = await pack.getDocument(rawId);
            if (actor) break;
          } catch (e) {}
        }
      }
    }

    if (!actor) {
      Ed4EncounterBuilder.log(true, `[Spawn-Process] ERROR: Could not find actor for ID/UUID: ${rawId}`);
      return;
    }

    const cleanActorName = actor.name.replace(/\([^)]*\)/g, '').trim().toLowerCase();
    const parts = cleanActorName.split(',').map(p => p.trim());
    const flippedName = parts.length > 1 ? `${parts.slice(1).join(' ')} ${parts[0]}`.toLowerCase() : null;

    // Gather all possible keys for this actor to check scene presence
    const possibleKeys = [actor.id, rawId, actor.uuid, cleanActorName];
    if (flippedName) possibleKeys.push(flippedName);

    let currentCount = 0;
    let matchedKey = null;

    for (const key of possibleKeys) {
      if (sceneActorCounts.has(key)) {
        currentCount = sceneActorCounts.get(key);
        matchedKey = key;
        break;
      }
    }

    // Substring fallback check if exact keys miss
    if (currentCount === 0) {
      for (const [nameKey, cnt] of sceneActorCounts.entries()) {
        if (nameKey.includes(cleanActorName) || cleanActorName.includes(nameKey)) {
          currentCount = cnt;
          matchedKey = nameKey;
          break;
        }
      }
    }

    Ed4EncounterBuilder.log(false, `[Spawn-Process] Actor "${actor.name}" -> Requested: ${requestedCount}, Found on scene: ${currentCount}`);

    if (currentCount < requestedCount) {
      // Need to spawn missing tokens
      const tokensNeeded = requestedCount - currentCount;
      Ed4EncounterBuilder.log(false, `[Spawn-Process] PASS: Spawning ${tokensNeeded} new token(s) for: ${actor.name}`);
      for (let i = 0; i < tokensNeeded; i++) {
        spawnedTokensData.push({
          name: actor.name,
          actorId: actor.id,
          x: xOffset,
          y: yOffset,
          hidden: false,
          ...actor.prototypeToken.toObject()
        });
        xOffset += 70; 
        if (xOffset > 800) { xOffset = 100; yOffset += 70; }
      }
    } else if (currentCount > requestedCount && matchedKey) {
      // Scene has excess tokens compared to builder count -> queue for removal
      const excessCount = currentCount - requestedCount;
      const tokensOfThisActor = sceneTokensByActor.get(matchedKey) || [];
      
      // Grab from the end of the array to prune excess
      for (let i = 0; i < excessCount && i < tokensOfThisActor.length; i++) {
        const tokenDocToPrune = tokensOfThisActor[tokensOfThisActor.length - 1 - i];
        if (tokenDocToPrune && !tokenIdsToRemove.includes(tokenDocToPrune.id)) {
          tokenIdsToRemove.push(tokenDocToPrune.id);
        }
      }
    }
  }

  // 1. Process Adversaries
  if (encounter.enemies) {
    for (const enemy of encounter.enemies) {
      await processActorToken(enemy.id, enemy.count || 1);
    }
  }

  // 2. Process PCs
  if (encounter.pcs) {
    for (const pcEntry of encounter.pcs) {
      await processActorToken(pcEntry.id, 1);
    }
  }

  // Handle Pruning (Excess tokens removed from builder) with User Confirmation
  if (tokenIdsToRemove.length > 0) {
    const tokensToPruneDocs = tokenIdsToRemove.map(id => activeScene.tokens.get(id)).filter(Boolean);
    const tokenNamesStr = tokensToPruneDocs.map(t => t.name).join(", ");

    const confirmed = await Dialog.confirm({
      title: "Prune Encounter Tokens?",
      content: `<p>The encounter builder has reduced counts for: <b>${tokenNamesStr}</b>.</p><p>Would you like to remove the excess token(s) from this scene?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      try {
        await activeScene.deleteEmbeddedDocuments("Token", tokenIdsToRemove);
        Ed4EncounterBuilder.log(false, `[Spawn] Successfully pruned ${tokenIdsToRemove.length} excess token(s) from scene.`);
      } catch (err) {
        Ed4EncounterBuilder.log(true, `[Spawn] Error pruning token documents:`, err);
      }
    }
  }

  // Handle Spawning (Missing tokens added to builder)
  let allTargetTokens = [...activeScene.tokens];

  if (spawnedTokensData.length > 0) {
    try {
      const createdTokens = await activeScene.createEmbeddedDocuments("Token", spawnedTokensData);
      Ed4EncounterBuilder.log(false, `[Spawn] Successfully created ${createdTokens.length} new tokens on scene.`);
      allTargetTokens = [...activeScene.tokens];
    } catch (err) {
      Ed4EncounterBuilder.log(true, `[Spawn] Error creating token documents:`, err);
    }
  } else if (spawnedTokensData.length === 0 && tokenIdsToRemove.length === 0) {
    Ed4EncounterBuilder.log(false, `[Spawn] Scene tokens are already perfectly synchronized with encounter builder.`);
  }

  Ed4EncounterBuilder.log(false, `[Spawn] ==================== END SPAWN/SYNC ====================`);
  return allTargetTokens;
}

  static async sendEncounterToCombat(createdTokens) {
    if (!createdTokens || createdTokens.length === 0) {
      ui.notifications.warn("No tokens provided to send to combat.");
      return;
    }

    try {
      // 1. Create a new Combat encounter in the world
      // (Foundry automatically sets it as the viewed/active combat tracker if desired)
      const combat = await Combat.create({ scene: canvas.scene.id, active: true });
      if (!combat) {
        ui.notifications.error("Failed to create a new combat encounter.");
        return;
      }

      // 2. Format the spawned tokens into combatant creation data
      const combatantData = createdTokens.map(token => ({
        tokenId: token.id,
        actorId: token.actorId,
        hidden: token.hidden
      }));

      // 3. Add the combatants to the newly created combat encounter
      await combat.createEmbeddedDocuments("Combatant", combatantData);

      ui.notifications.info(`Successfully created combat tracker with ${combatantData.length} combatants!`);
      Ed4EncounterBuilder.log(false, `Combat created successfully with ID: ${combat.id}`);

      // Optional: Roll initiative automatically for everyone
      // await combat.rollAll();

    } catch (err) {
      Ed4EncounterBuilder.log(true, "Error creating combat encounter:", err);
      ui.notifications.error("An error occurred while sending the encounter to combat. Check console for details.");
    }
  }

  static compendiums = {
    "Creatures": [
      "earthdawn-gm-compendium.game-masters-guide-creatures",
      "earthdawn-companion.companion-creatures",
      "earthdawn-panda-bestiary.panda-bestiary",
      "ed-travar.travar-creatures",
      "vasgothia.creatures-vasgothia"
    ]
  };

  /**
   * Dynamically resolves installed compendiums matching Actor document types and creature patterns.
   */
  static getCreaturePacks() {
    return Array.from(game.packs.values()).filter(pack => {
      // Only target Actor compendiums
      if (pack.documentName !== "Actor") return false;

      const collectionKey = pack.collection.toLowerCase();

      // Match base keys defined in static compendiums array or common creature key patterns
      const matchesConfigured = this.compendiums["Creatures"].some(baseKey => 
        collectionKey.startsWith(baseKey.toLowerCase())
      );

      const matchesPattern = collectionKey.includes("creatures") || collectionKey.includes("bestiary");

      return matchesConfigured || matchesPattern;
    });
  }

  static async loadCompendiums(forceFlag = false) {
    if (!forceFlag && !this.compendiumsNeedToBeLoaded) return;

    if (!game.ready) {
      Ed4EncounterBuilder.log(true, "Game is not ready yet. Deferring compendium load.");
      return;
    }

    this.adversaries = [];
    const targetPacks = this.getCreaturePacks();

    if (targetPacks.length === 0) {
      Ed4EncounterBuilder.log(true, "No creature actor compendiums found in this world.");
      return;
    }

    Ed4EncounterBuilder.log(
      true, 
      `Found ${targetPacks.length} creature pack(s): ${targetPacks.map(p => p.collection).join(", ")}`
    );

    // Load all matched pack collections concurrently
    await Promise.all(targetPacks.map(pack => this.loadCompendium(pack.collection)));

    this.compendiumsNeedToBeLoaded = false;
    Ed4EncounterBuilder.log(true, `Done loading compendiums. Total adversaries loaded: ${this.adversaries.length}`);
  }

  static async loadCompendium(compendiumName) {
    try {
      const pack = game.packs.get(compendiumName);
      if (!pack) {
        Ed4EncounterBuilder.log(true, `Compendium pack not found: ${compendiumName}`);
        return;
      }

      Ed4EncounterBuilder.log(false, `Loading documents from compendium pack: ${compendiumName}`);

      // Bypass pack.getIndex() to avoid the Foundry V13 backend projection crash.
      // Fetching the full documents guarantees we get the data without the server tripping over schema inconsistencies.
      const docs = await pack.getDocuments();

      Ed4EncounterBuilder.log(false, `Found ${docs.length} entries in pack '${compendiumName}'. Processing...`);

      for (const doc of docs) {
        // Skip player characters if they happen to be in the compendium
        if (doc.type === "character") continue; 

        this.addCompendiumIndexToAdversaries(doc, compendiumName);
      }

      Ed4EncounterBuilder.log(false, `Successfully loaded adversaries from ${compendiumName}`);
    } catch (e) {
      Ed4EncounterBuilder.log(true, `Error loading compendium ${compendiumName}:`, e);
    }
  }

  static addCompendiumIndexToAdversaries(entry, compendium) {
      // 1. DUMP THE RAW SYSTEM DATA FOR INSPECTION
      // Open your browser console (F12) to expand these objects and look for the correct path
      Ed4EncounterBuilder.log(
        false, 
        `[Schema Inspection] "${entry.name}" (Type: ${entry.type}) | System Data:`, 
        entry.system
      );

      // 2. Extract the challenge rating, including the new challenge.rate path
      const challengeRaw = entry.system?.challenge?.rate
                        ?? entry.system?.details?.circle
                        ?? entry.system?.circle
                        ?? entry.system?.challenge
                        ?? entry.system?.cr;

      const challengeNum = this.getChallengeNumberFromString(challengeRaw, entry.name);

      // 3. Log what we actually extracted vs what it resolved to
      Ed4EncounterBuilder.log(
        false, 
        `[Adversary Indexed] "${entry.name}" | Extracted Raw Value:`, 
        challengeRaw, 
        `| Resolved Rating: EC/CR ${challengeNum}`
      );

      this.adversaries.push({
        id: entry.id || entry._id, // getDocuments uses .id, getIndex uses ._id
        name: entry.name,
        challenge: challengeNum,
        type: entry.type,
        img: entry.img || "icons/svg/mystery-man.svg",
        compendium: compendium
      });
    }

  static getChallengeNumberFromString(challenge, name) {
    const originalInput = challenge;

    // 1. Unpack object schemas
    if (typeof challenge === "object" && challenge !== null) {
      challenge = challenge.value ?? challenge.total ?? challenge.circle ?? challenge.cr;
      Ed4EncounterBuilder.log(false, `[CR Parse] Unpacked object schema for "${name}":`, originalInput, `=>`, challenge);
    }

    // 2. Direct numeric check
    if (typeof challenge === "number" && !isNaN(challenge)) {
      Ed4EncounterBuilder.log(false, `[CR Parse] Raw number matched for "${name}": ${challenge}`);
      return challenge;
    }

    const challengeStr = String(challenge ?? "").toLowerCase().trim();
    const nameStr = String(name ?? "").toUpperCase();

    // 3. String numeric conversion
    const parsed = Number(challengeStr);
    if (!isNaN(parsed) && challengeStr !== "") {
      Ed4EncounterBuilder.log(false, `[CR Parse] Parsed numeric string for "${name}": "${challengeStr}" => ${parsed}`);
      return parsed;
    }

    // 4. Substring / Word Match
    const wordMap = [
      { words: ["fifteen", "15"], val: 15 },
      { words: ["fourteen", "14"], val: 14 },
      { words: ["thirteen", "13"], val: 13 },
      { words: ["twel", "12"], val: 12 },
      { words: ["eleven", "11"], val: 11 },
      { words: ["ten", "10"], val: 10 },
      { words: ["nin", "9"], val: 9 },
      { words: ["eight", "8"], val: 8 },
      { words: ["seven", "7"], val: 7 },
      { words: ["six", "6"], val: 6 },
      { words: ["fifth", "five", "5"], val: 5 },
      { words: ["four", "4"], val: 4 },
      { words: ["three", "third", "3"], val: 3 },
      { words: ["two", "second", "2"], val: 2 }
    ];

    for (const { words, val } of wordMap) {
      if (words.some(w => challengeStr.includes(w))) {
        Ed4EncounterBuilder.log(false, `[CR Parse] Word match for "${name}": "${challengeStr}" => ${val}`);
        return val;
      }
    }

    // 5. Name fallback match (e.g. "Gorgon Circle 4")
    const srMatch = nameStr.match(/(?:SR|CIRCLE)\s*(\d+)/i);
    if (srMatch) {
      const val = Number(srMatch[1]);
      Ed4EncounterBuilder.log(false, `[CR Parse] Name Regex match for "${name}": ${val}`);
      return val;
    }

    // 6. Default fallback
    Ed4EncounterBuilder.log(true, `[CR Parse] Fallback to default (1) for "${name}". Raw input was:`, originalInput);
    return 1;
  }

  static get getPcs() {
    const pcsList =  game.actors.filter(p => p.type == 'character').filter(p => canvas.tokens.placeables.find(c => c.name == p.prototypeToken.name))
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
    Ed4EncounterBuilder.log(false, "Calculating effective circle for " + pc.name + " with LP: " + pc.system.lp.total)
    if (pc.system.lp.total < 800)
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",1);
    else if (pc.system.lp.total < 2300) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",2);
    else if (pc.system.lp.total < 7000) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",3);
    else if (pc.system.lp.total < 16500) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",4);
    else if (pc.system.lp.total < 35000) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",5);
    else if (pc.system.lp.total < 70000) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",6);
    else if (pc.system.lp.total < 132000) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",7);
    else if (pc.system.lp.total < 255000) 
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",8);
    else if (pc.system.lp.total < 490000)
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",9);
    else if (pc.system.lp.total < 922000)
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",10);
    else if (pc.system.lp.total < 1695000)
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",11);
    else if (pc.system.lp.total < 3175000)
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",12);
    else if (pc.system.lp.total < 6050000)
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",13);
    else if (pc.system.lp.total < 11200000)
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",14);
    else
      Ed4EncounterBuilder.setEd4FlagOnActor(pc, "effectiveCircle",15);
  }

} // Ed4EncounterBuilder class


/*
            Hooks

 */

Hooks.once('ready', async () => {
  await Ed4EncounterBuilder.loadCompendiums(true);
});

Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(Ed4EncounterBuilder.ID);
  console.log("ed4-encounter-builder | registerPackageDebugFlag true");
});

Hooks.on("renderSceneControls", (controls, b, c) => {
    if (game.user.isGM) {
        $(".main-controls").append(`
    <li class="scene-control " data-control="ed4-encounter-builder" data-tooltip="${game.i18n.localize("ED4-ENCOUNTERBUILDER.button-title")}">
    <i class="fas fa-swords"></i>
    </li>
    `);
    }
});

Hooks.once('init', async function() {
  Ed4EncounterBuilder.log(false,  'ED4 Encounter Builder initializing!');
  Ed4EncounterBuilder.initialize();
  

  Ed4EncounterBuilder.log(false, "Registering Handlebars helpers");

  Handlebars.registerHelper('pcIsInEncounter', function(pcId, encounterId) {
    const encounter = EncounterData.allEncounters?.[encounterId];
    if (!encounter || !encounter.pcs) return false;
    return encounter.pcs.some(pc => pc.id === pcId);
  });

  Ed4EncounterBuilder.log(true,  'ED4 Encounter Builder initialized!');
});


$(document).on("click", `li[data-control="ed4-encounter-builder"]`, (e) => {
  //render our encounter builder UI
  Ed4EncounterBuilder.encounterListForm.render(true, { userId: game.userId});
});

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
  static crFilter = "";
  static crMaxFilter = "";

  static get allAdversaries() {
    //await Ed4EncounterBuilder.loadCompendiums(false);

    return Ed4EncounterBuilder.adversaries;
  }

  static crFiltered(creatureChallenge) {
    if (!this.crFilter || this.crFilter === "" ) {
      if (this.crMaxFilter && this.crMaxFilter !== "") {
        if (creatureChallenge > this.crMaxFilter)
          return true;
      }
      //Ed4EncounterBuilder.log(false, "filter: " + this.crFilter);
      return false;
    }

    if (this.crMaxFilter && this.crMaxFilter !== "") {
      if (creatureChallenge >= this.crFilter && creatureChallenge <= this.crMaxFilter)
        return false;
      return true;
    } 
    if (this.crFilter != creatureChallenge) {
      
      //Ed4EncounterBuilder.log(false, "filter: " + this.crFilter);
      return true;
    }

  }
  static get filteredAdversaries() {
    
    return Ed4EncounterBuilder.adversaries.filter((creature) => !this.crFiltered(creature.challenge) && creature.name.toUpperCase().includes(this.filter.toUpperCase()));
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

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class EncounterListForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'encounter-list',
    classes: ['ed4-encounter-list'],
    tag: 'form',
    window: {
      title: 'Encounters',
      resizable: true
    },
    position: {
      width: 400,
      height: 'auto'
    },
    form: {
      handler: EncounterListForm.#onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    },
    // Match these keys to whatever data-action values are inside your enclist.hbs file
    actions: {
      create: EncounterListForm.#onCreateEncounter,
      build: EncounterListForm.#onBuildEncounter,
      delete: EncounterListForm.#onDeleteEncounter
    }
  };

  static PARTS = {
    form: {
      template: Ed4EncounterBuilder.TEMPLATES.ENCLIST
    }
  };

  async _prepareContext(options) {
    return {
      encounters: EncounterData.getEncountersForUser(this.options.userId || game.userId),
      adversaries: EncounterData.allAdversaries,
    };
  }

  static async #onSubmitForm(event, form, formData) {
    if (!event || !event.target) {
      const expandedData = foundry.utils.expandObject(formData.object);
      if (!foundry.utils.isEmpty(expandedData)) {
         await EncounterData.updateUserEncounters(this.options.userId || game.userId, expandedData);
      }
      return;
    }

    const target = event.target;
    const encounterId = target.closest('[data-encounter-list-id]')?.dataset?.encounterListId;
    if (!encounterId) return;

    let fieldName = target.name;
    if (fieldName.includes('.')) {
        fieldName = fieldName.split('.').pop(); 
    }

    const value = target.type === 'checkbox' ? target.checked : target.value;
    
    await EncounterData.updateEncounter(encounterId, { 
        [fieldName]: value 
    });
    
    // Refresh builder form if open for this specific encounter
    const builder = Ed4EncounterBuilder.encounterBuilderForm;
    if (builder && builder.rendered && builder.currentEncounterId === encounterId) {
      builder.render();
    }

    if (target.type === 'checkbox') {
        this.render(true)
    }
  }

  static async #onCreateEncounter(event, target) {
    Ed4EncounterBuilder.log(false, 'EncounterListForm: Create Encounter button clicked.');
    await EncounterData.createEncounter(this.options.userId || game.userId);
    this.render(true);
  }

  static async #onBuildEncounter(event, target) {
    const encounterId = target.closest('[data-encounter-list-id]')?.dataset?.encounterListId 
                     || target.closest('[data-encounter-list-id]')?.dataset?.encounterBuilderId;
                     
    Ed4EncounterBuilder.log(false, `EncounterListForm: Build Encounter button clicked for ID: ${encounterId}`);
    
    if (Ed4EncounterBuilder.encounterBuilderForm) {
      Ed4EncounterBuilder.encounterBuilderForm.encounterId = encounterId; // <-- Assign active ID
      Ed4EncounterBuilder.encounterBuilderForm.render({force: true} );
    } else {
      Ed4EncounterBuilder.encounterBuilderForm = new EncounterBuilderForm({ encounterId });
      Ed4EncounterBuilder.encounterBuilderForm.render({force: true});
    }
  }

  static async #onDeleteEncounter(event, target) {
    const encounterId = target.closest('[data-encounter-list-id]')?.dataset?.encounterListId;
    Ed4EncounterBuilder.log(false, `EncounterListForm: Delete Encounter button clicked for ID: ${encounterId}`);
    
    await EncounterData.deleteEncounter(encounterId);
    this.render(true);
  }
}

/*
            EncounterBuilderForm

 */

class EncounterBuilderForm extends HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(options = {}) {
    // Normalize string parameters to object options
    if (typeof options === "string") {
      options = { encounterId: options };
    }
    super(options);

    this.encounterId = options.encounterId || options.id || options.encounter?.id;
  }

  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      id: "ed4-encounter-builder",
      classes: ["earthdawn", "encounter-builder"],
      window: {
        title: "ED4.EncounterBuilder.Title",
        resizable: true,
        width: 650,
        height: 700
      },
      actions: {
        addParticipant: EncounterBuilderForm._onAddParticipant,
        removeParticipant: EncounterBuilderForm._onRemoveParticipant
      }
    });
  }

  static PARTS = {
    form: {
      template: Ed4EncounterBuilder.TEMPLATES.ENCBUILDER
    }
  };

  get currentEncounterId() {
    return this.encounterId || this.options.encounterId || Object.keys(EncounterData.allEncounters || {})[0];
  }

  async _prepareContext(options) {
    const encId = this.currentEncounterId;
    const encounter = EncounterData.allEncounters?.[encId] || {};

    // Filter adversaries dynamically
    let filteredAdversaries = EncounterData.allAdversaries || [];
    const textFilter = (EncounterData.filter || "").toLowerCase().trim();
    const minCr = Number.parseInt(EncounterData.crFilter);
    const maxCr = Number.parseInt(EncounterData.crMaxFilter);

    if (textFilter || !isNaN(minCr) || !isNaN(maxCr)) {
      filteredAdversaries = filteredAdversaries.filter(a => {
        const matchesName = !textFilter || a.name.toLowerCase().includes(textFilter);
        const crVal = Ed4EncounterBuilder.getChallengeNumberFromString(a.challenge, a.name);
        const matchesMin = isNaN(minCr) || crVal >= minCr;
        const matchesMax = isNaN(maxCr) || crVal <= maxCr;
        return matchesName && matchesMin && matchesMax;
      });
    }

    return { 
      encounter,
      adversaries: filteredAdversaries,
      allpcs: Ed4EncounterBuilder.getPcs || [],
      filter: EncounterData.filter || "",
      crfilter: EncounterData.crFilter || "",
      crmaxfilter: EncounterData.crMaxFilter || ""
    };
  }



  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // 1. Determine active tab (defaults to 'roster' on initial render)
    const activeTab = this._activeTab || 'roster';

    // 2. Restore active tab state after re-rendering
    html.querySelectorAll('.sheet-tabs .item').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === activeTab);
    });
    html.querySelectorAll('.tab-content .tab').forEach(content => {
      const isActive = content.dataset.tab === activeTab;
      content.classList.toggle('active', isActive);
      content.style.display = isActive ? 'block' : 'none';
    });

    // 3. Tab Click Listener (saves active tab to instance state)
    html.querySelectorAll('.sheet-tabs .item').forEach(tab => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        const targetTab = event.currentTarget.dataset.tab;
        
        // Persist selection across re-renders
        this._activeTab = targetTab;

        // Toggle Active Tab Header
        html.querySelectorAll('.sheet-tabs .item').forEach(t => t.classList.remove('active'));
        event.currentTarget.classList.add('active');

        // Toggle Active Tab Body
        html.querySelectorAll('.tab-content .tab').forEach(content => {
          if (content.dataset.tab === targetTab) {
            content.classList.add('active');
            content.style.display = 'block';
          } else {
            content.classList.remove('active');
            content.style.display = 'none';
          }
        });
      });
    });

    // 4. Restore focus and cursor position if an input was active prior to re-render
    if (this._focusedInput) {
      const input = html.querySelector(`input[name="${this._focusedInput.name}"]`);
      if (input) {
        input.focus();
        if (typeof input.setSelectionRange === "function" && this._focusedInput.start !== null) {
          input.setSelectionRange(this._focusedInput.start, this._focusedInput.end);
        }
      }
      this._focusedInput = null;
    }

    // 5. Attach live input listeners for instant search
    html.querySelectorAll('input[name="filter"], input[name="crfilter"], input[name="crmaxfilter"]').forEach(input => {
      input.addEventListener('input', (event) => {
        // Store current active input and selection state
        this._focusedInput = {
          name: event.target.name,
          start: event.target.selectionStart,
          end: event.target.selectionEnd
        };

        EncounterData.filter = html.querySelector('input[name="filter"]')?.value || "";
        EncounterData.crFilter = html.querySelector('input[name="crfilter"]')?.value || "";
        EncounterData.crMaxFilter = html.querySelector('input[name="crmaxfilter"]')?.value || "";

        this.render(true)
      });
    });
  }

  static async #onSubmitForm(event, form, formData) {
    const rawData = formData.object;
    const encId = this.currentEncounterId;

    if ("filter" in rawData) EncounterData.filter = rawData.filter;
    if ("crfilter" in rawData) EncounterData.crFilter = rawData.crfilter;
    if ("crmaxfilter" in rawData) EncounterData.crMaxFilter = rawData.crmaxfilter;

    const encounter = EncounterData.allEncounters?.[encId];
    if (encounter) {
      if ("label" in rawData) encounter.label = rawData.label; // <-- ADDED: Save title changes
      if ("environment" in rawData) encounter.environment = rawData.environment;
      if ("tactics" in rawData) encounter.tactics = rawData.tactics;
      if ("rewards" in rawData) encounter.rewards = rawData.rewards;
      if ("description" in rawData) encounter.description = rawData.description;

      const expanded = foundry.utils.expandObject(rawData);
      if (expanded.enemyCount && encounter.enemies) {
        for (const enemy of encounter.enemies) {
          if (enemy.id in expanded.enemyCount) {
            enemy.count = Math.max(1, Number.parseInt(expanded.enemyCount[enemy.id]) || 1);
          }
        }
      }

      await EncounterData.saveEncounter(encId, { [encId]: encounter });
      EncounterBuilderForm.calculateEncounterDifficulty(encId);
    }

    this.render({force: true});
  }

  static async #onDone(event, target) {
    this.close();
  }

  static async #onRemoveEnemy(event, target) {
    const adversaryId = target.closest('[data-encounter-adversary-id]')?.dataset?.encounterAdversaryId;
    const encId = this.currentEncounterId;
    const encounter = EncounterData.allEncounters?.[encId];
    
    if (encounter && adversaryId) {
      encounter.enemies = (encounter.enemies || []).filter(e => e.id !== adversaryId);
      await EncounterData.saveEncounter(encId, { [encId]: encounter });
      EncounterBuilderForm.calculateEncounterDifficulty(encId);
    }
    this.render(true);
  }

  static async #onAddEnemy(event, target) {
    const container = target.closest('[data-encounter-adversary-id]');
    const adversaryId = container?.dataset?.encounterAdversaryId;
    const countInput = container?.querySelector(`input[name="addCount.${adversaryId}"]`)?.value || 1;
    const addCount = Math.max(1, Number.parseInt(countInput) || 1);
    const encId = this.currentEncounterId;

    const encounter = EncounterData.allEncounters?.[encId];
    const adversary = Ed4EncounterBuilder.adversaries?.find(a => a.id === adversaryId);

    if (encounter && adversary) {
      encounter.enemies = encounter.enemies || [];
      const existing = encounter.enemies.find(e => e.id === adversaryId);

      if (existing) {
        existing.count = Number(existing.count) + addCount;
      } else {
        encounter.enemies.push({
          id: adversary.id,
          name: adversary.name,
          img: adversary.img,
          challenge: adversary.challenge,
          count: addCount
        });
      }

      await EncounterData.saveEncounter(encId, { [encId]: encounter });
      EncounterBuilderForm.calculateEncounterDifficulty(encId);
    }
    this.render(true);
  }

  static async #onTogglePc(event, target) {
    const pcId = target.closest('[data-encounter-pc-id]')?.dataset?.encounterPcId;
    const encId = this.currentEncounterId;
    const encounter = EncounterData.allEncounters?.[encId];

    if (encounter && pcId) {
      encounter.pcs = encounter.pcs || [];
      const idx = encounter.pcs.findIndex(pc => pc.id === pcId);

      if (idx > -1) {
        encounter.pcs.splice(idx, 1);
      } else {
        encounter.pcs.push({
          id: pcId,
          effectiveCircle: Ed4EncounterBuilder.getPcAndCalculateEC(pcId) || 1
        });
      }

      await EncounterData.saveEncounter(encId, { [encId]: encounter });
      EncounterBuilderForm.calculateEncounterDifficulty(encId);
    }
    this.render(true);
  }

  static async #onViewAdversary(event, target) {
    const adversaryId = target.closest('[data-encounter-adversary-id]')?.dataset?.encounterAdversaryId;
    const found = Ed4EncounterBuilder.adversaries?.find(a => a.id === adversaryId);

    if (found?.compendium) {
      const pack = game.packs.get(found.compendium);
      if (pack) {
        const doc = await pack.getDocument(adversaryId);
        doc?.sheet?.render(true);
      }
    }
  }

  static async #onSendToCombat(event, target) {
    const encounterId = this.currentEncounterId || target.closest("form")?.dataset?.encounterId;
  
    // Step 1: Spawn tokens on the canvas
    const createdTokens = await Ed4EncounterBuilder.spawnEncounterTokens(encounterId);
    
    // Step 2: Push those tokens into a new Combat tracker encounter
    if (createdTokens.length > 0) {
      await Ed4EncounterBuilder.sendEncounterToCombat(createdTokens);
    }
  }

  static async #onGenerateReward(event, target) {
    const encId = this.currentEncounterId;
    const encounter = EncounterData.allEncounters?.[encId];
    if (!encounter) return;

    // 1. Calculate sum of selected PCs' ECRs
    const pcs = encounter.pcs || [];
    const totalEcr = pcs.reduce((sum, pc) => {
      const ecr = Number(pc.effectiveCircle) || 0;
      return sum + ecr;
    }, 0);

    const tavs = totalEcr * 100;
    const awardString = `${tavs} Tavs`;

    // 2. Read current DOM value to preserve any unsaved text typed by GM
    const textarea = this.element.querySelector('textarea[name="rewards"]');
    const existingText = textarea ? textarea.value.trim() : (encounter.rewards || "").trim();

    // 3. Append generated award to current content
    encounter.rewards = existingText ? `${existingText}\n${awardString}` : awardString;

    // 4. Save and re-render
    await EncounterData.saveEncounter(encId, { [encId]: encounter });
    this.render(true);
  }

  static calculateEncounterDifficulty(encounterId) {
    const encounter = EncounterData.allEncounters?.[encounterId];
    if (!encounter) return;

    let enemyStrength = 0;
    (encounter.enemies || []).forEach(e => {
      enemyStrength += Ed4EncounterBuilder.getChallengeNumberFromString(e.challenge, e.name) * (e.count || 1);
    });

    let partyStrength = 0;
    (encounter.pcs || []).forEach(pc => {
      partyStrength += (pc.effectiveCircle || 1);
    });

    enemyStrength = enemyStrength || 0.1;
    partyStrength = partyStrength || 0.1;

    const ratio = partyStrength / enemyStrength;
    encounter.difficulty = ratio;

    if (ratio > 1.5) encounter.difficultyRating = "simple";
    else if (ratio > 1.2) encounter.difficultyRating = "easy";
    else if (ratio > 0.8) encounter.difficultyRating = "normal";
    else if (ratio > 0.5) encounter.difficultyRating = "hard";
    else encounter.difficultyRating = "deadly";

    EncounterData.saveEncounter(encounterId, { [encounterId]: encounter });
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

  // Fallback to whichever property your class uses to track the active encounter
  const encounterId = this.options?.encounterId || this.encounterId || this.currentEncounterId;
  const encounter = EncounterData.allEncounters?.[encounterId] || {};

  // Safely resolve getPcs whether it's an array, a getter, or a function
  const rawPcs = typeof Ed4EncounterBuilder.getPcs === 'function' 
    ? Ed4EncounterBuilder.getPcs() 
    : Ed4EncounterBuilder.getPcs;

Ed4EncounterBuilder.log(false, "Sorting PCs for encounter:", encounterId, sortedPcs);
  const sortedPcs = [...(rawPcs || [])];

  sortedPcs.sort((a, b) => {
    const aSelected = encounter?.pcs?.some(pc => pc.id === a.id) || false;
    const bSelected = encounter?.pcs?.some(pc => pc.id === b.id) || false;
    
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    
    return a.name.localeCompare(b.name);
  });

  return { 
    encounter: encounter,
    adversaries: EncounterData.allAdversaries,
    filteredAdversaries: EncounterData.filteredAdversaries,
    allpcs: sortedPcs,
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

    this.render(true);
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

  static _handleCRFilter(event) {
    console.log(event);
    Ed4EncounterBuilder.log(false, "CR filter text is: " + event.srcElement.value);
    EncounterData.crFilter = Number.parseInt(event.srcElement.value);
    
    const adversariesRowEls = event.srcElement.parentNode.parentNode.querySelectorAll("li.ed4-encounter-builder-griditem");
    for (const el of adversariesRowEls) {
      if (EncounterData.filteredAdversaries.find((element) => element.id === el.dataset.encounterAdversaryId) ) { 
        if (el.classList.contains("hidden")) {
          el.classList.remove("hidden");
          Ed4EncounterBuilder.log(false, "setting " + el.dataset.encounterAdversaryId + " to visible");
        }
      } else {
        el.classList.add("hidden");
      }
    }
  }

  static _handleCRMaxFilter(event) {
    console.log(event);
    Ed4EncounterBuilder.log(false, "CR Max filter text is: " + event.srcElement.value);
    EncounterData.crMaxFilter = Number.parseInt(event.srcElement.value);
    
    const adversariesRowEls = event.srcElement.parentNode.parentNode.querySelectorAll("li.ed4-encounter-builder-griditem");
    for (const el of adversariesRowEls) {
      if (EncounterData.filteredAdversaries.find((element) => element.id === el.dataset.encounterAdversaryId) ) { 
        if (el.classList.contains("hidden")) {
          el.classList.remove("hidden");
          Ed4EncounterBuilder.log(false, "setting " + el.dataset.encounterAdversaryId + " to visible");
        }
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
          Ed4EncounterBuilder.log(false, `Checking ${found.compendium} for adversary id: ${adversaryId}`);
          const document = game.packs.get(compendiumName).get(adversaryId) ?? await game.packs.get(compendiumName).getDocument(adversaryId);
          document.sheet.render(true);
        }
        break;

      default:
        Ed4EncounterBuilder.log(false, 'BuildEncounterForm: Invalid action detected', action);
    }
  }

} //EncounterBuilderForm

// Global window binding for legacy module compatibility
window.EncounterBuilderForm = EncounterBuilderForm;