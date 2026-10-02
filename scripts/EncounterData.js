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

  /**
   * Gets all of a given user's Encounters
   * 
   * @param {string} userId - id of the user whose Encounters to return
   * @returns {Record<string, encounter> | undefined}
   */
  static getEncountersForUser(userId) {
    return game.users.get(userId)?.getFlag(Encounter.ID, Encounter.FLAGS.Encounters);
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
      ...encounterData,
      id: foundry.utils.randomID(16),
      userId,
    }

    // construct the update to insert the new encounter
    const newEncounters = {
      [newencounter.id]: newencounter
    }

    // update the database with the new Encounters
    return game.users.get(userId)?.setFlag(Encounter.ID, Encounter.FLAGS.Encounters, newEncounters);
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
    return game.users.get(relevantencounter.userId)?.setFlag(Encounter.ID, Encounter.FLAGS.Encounters, update);
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
    return game.users.get(relevantencounter.userId)?.setFlag(Encounter.ID, Encounter.FLAGS.Encounters, keyDeletion);
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
    return game.users.get(userId)?.setFlag(Encounter.ID, Encounter.FLAGS.Encounters, updateData);
  }
}