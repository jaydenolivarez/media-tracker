// Canonical stage names for all components
// Canonical stage names and descriptions per mediaType
export const MEDIA_TYPE_STAGES = {
  photos: {
    NAMES: [
      "Created",
      "Scheduling",
      "Shooting",
      "1st Round Edits",
      "In House Edits",
      "Publishing",
      "Completed"
    ],
    DESCRIPTIONS: {
      Created: "Task has been created.",
      Scheduling: "Awaiting available shooting date.",
      Shooting: "Shooting is scheduled and pending.",
      "1st Round Edits": "Outsourced editing in progress.",
      "In House Edits": "OR editing in progress.",
      Publishing: "Media is ready to publish.",
      Completed: "Task is fully completed."
    }
  },
  "3d_tours": {
    NAMES: [
      "Created",
      "Scheduling",
      "Shooting",
      "Editing",
      "Publishing",
      "Completed"
    ],
    DESCRIPTIONS: {
      Created: "Task has been created.",
      Scheduling: "Awaiting available shooting date.",
      Shooting: "Shooting is scheduled and pending.",
      Editing: "Editing in progress.",
      Publishing: "Media is ready to publish.",
      Completed: "Task is fully completed."
    }
  },
  default: {
    NAMES: [
      "Created",
      "Scheduling",
      "Shooting",
      "Editing",
      "Publishing",
      "Completed"
    ],
    DESCRIPTIONS: {
      Created: "Task has been created.",
      Scheduling: "Awaiting available shooting date.",
      Shooting: "Shooting is scheduled and pending.",
      Editing: "Editing in progress.",
      Publishing: "Media is ready to publish.",
      Completed: "Task is fully completed."
    }
  }
};

// Utility to get stages/descriptions for a given mediaType
export function getStagesForMediaType(mediaType) {
  return MEDIA_TYPE_STAGES[mediaType] || MEDIA_TYPE_STAGES.default;
}
