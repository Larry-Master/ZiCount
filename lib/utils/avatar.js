/**
 * Avatar Utilities for ZiCount
 * 
 * Provides helper functions for generating avatar display text
 * with support for duplicate name handling.
 */

/**
 * Get avatar display text (letter + number for duplicates)
 * 
 * @param {Object} person - Person object with name property
 * @returns {string} Avatar display text (e.g., "K" or "K2")
 */
export const getAvatarDisplay = (person) => {
  const name = person.name;
  const firstLetter = name.charAt(0).toUpperCase();
  
  // Check if name ends with " X" where X is a number (duplicate pattern)
  const duplicateMatch = name.match(/^(.+)\s(\d+)$/);
  if (duplicateMatch) {
    return firstLetter + duplicateMatch[2]; // Return letter + number (e.g., "K2")
  }
  return firstLetter; // Return just the first letter for non-duplicates
};