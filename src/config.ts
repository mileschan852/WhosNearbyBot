export const sysConfig = {
  prices: {
    unlockProfile: 1000,
    invisibleSub: 2000,
    filterSub: 2000,
    extraRow: 1000,
    raffleTicket: 100,
    flyingMessage: 0,
  },
  durations: { invisibleDays: 30, filterSubDays: 30, refreshCooldownMin: 5 },
  raffle: { targetDay: 3, targetHour: 20, minTickets: 20 }
};

const whosNearConfig = {
  appBranch: "whos_near",
  theme: { primary: "#E94057", bg: "#121212" },
  preferences: [
    { id: "intent", label: "Seeking", options: ["Dating", "Friends", "Casual"], locked: false }
  ]
};

export const appConfig = whosNearConfig;
