export type MockCard = {
  cardId: string;
  cardholderName: string;
  team: string;
  currentLimit: { currency: string; amount: number };
  status: "active" | "frozen" | "cancelled";
  email: string;
};

const MARKETING_MEMBERS = [
  "Alice Tan", "Bob Lee", "Carol Ng", "David Chen", "Eva Lim",
  "Frank Wu", "Grace Ho", "Henry Koh", "Iris Yeo", "James Low",
  "Karen Sim", "Leon Tay", "Mia Chan", "Nathan Ong", "Olivia Pek",
  "Peter Goh", "Quinn Lau", "Rachel Soh", "Sam Teo", "Tina Woo",
  "Uma Bala", "Victor Tan", "Wendy Ng", "Xavier Lee", "Yvonne Chen",
  "Zach Lim", "Aaron Ho", "Betty Koh", "Chris Yeo", "Diana Low",
  "Edwin Sim", "Fiona Tay", "George Chan", "Hannah Ong", "Ian Pek",
  "Julia Goh", "Kevin Lau", "Linda Soh", "Mike Teo", "Nancy Woo",
  "Oscar Bala", "Penny Tan", "Quinn Ng", "Robert Lee", "Sarah Chen",
  "Tom Lim", "Uma Ho", "Victor Koh", "Wanda Yeo", "Xena Low",
];

// Inject realistic exclusions: indices 7, 15, 23 are frozen; 31, 42 are cancelled
const FROZEN_INDICES = new Set([7, 15, 23]);
const CANCELLED_INDICES = new Set([31, 42]);

export const MOCK_CARDS: MockCard[] = MARKETING_MEMBERS.map((name, i) => ({
  cardId: `CARD-MKT-${String(i + 1).padStart(3, "0")}`,
  cardholderName: name,
  team: "Marketing",
  currentLimit: {
    currency: "SGD",
    amount: 500 + (i % 5) * 200, // 500 | 700 | 900 | 1100 | 1300
  },
  status: FROZEN_INDICES.has(i)
    ? "frozen"
    : CANCELLED_INDICES.has(i)
    ? "cancelled"
    : "active",
  email: `${name.toLowerCase().replace(/ /g, ".")}@company.com`,
}));

const ENGINEERING_MEMBERS = [
  "Alan Tan", "Ben Lim", "Clara Ng", "Derek Koh", "Elaine Yeo",
  "Felix Low", "Gina Sim", "Harry Tay", "Ivy Chan", "Jake Ong",
  "Kelly Pek", "Liam Goh", "Megan Lau", "Nick Soh", "Olivia Teo",
  "Patrick Woo", "Rosa Bala", "Sam Tan", "Tara Ng", "Umar Lee",
];

const ENG_FROZEN_INDICES = new Set([4, 12]);
const ENG_CANCELLED_INDICES = new Set([17]);

const ENGINEERING_CARDS: MockCard[] = ENGINEERING_MEMBERS.map((name, i) => ({
  cardId: `CARD-ENG-${String(i + 1).padStart(3, "0")}`,
  cardholderName: name,
  team: "Engineering",
  currentLimit: {
    currency: "SGD",
    amount: 800 + (i % 4) * 300, // 800 | 1100 | 1400 | 1700
  },
  status: ENG_FROZEN_INDICES.has(i)
    ? "frozen"
    : ENG_CANCELLED_INDICES.has(i)
    ? "cancelled"
    : "active",
  email: `${name.toLowerCase().replace(/ /g, ".")}@company.com`,
}));

const FINANCE_MEMBERS = [
  "Adam Chua", "Bella Tan", "Calvin Ho", "Diana Koh", "Edward Yeo",
  "Faye Low", "Gary Sim", "Helen Tay", "Ivan Chan", "Jessica Ong",
];

const FIN_FROZEN_INDICES = new Set([2]);

const FINANCE_CARDS: MockCard[] = FINANCE_MEMBERS.map((name, i) => ({
  cardId: `CARD-FIN-${String(i + 1).padStart(3, "0")}`,
  cardholderName: name,
  team: "Finance",
  currentLimit: {
    currency: "SGD",
    amount: 1000 + (i % 3) * 500, // 1000 | 1500 | 2000
  },
  status: FIN_FROZEN_INDICES.has(i) ? "frozen" : "active",
  email: `${name.toLowerCase().replace(/ /g, ".")}@company.com`,
}));

export const MOCK_CARDS: MockCard[] = [
  ...MARKETING_CARDS,
  ...ENGINEERING_CARDS,
  ...FINANCE_CARDS,
];

export function getCardsByTeam(team: string): MockCard[] {
  return MOCK_CARDS.filter(
    (c) => c.team.toLowerCase() === team.toLowerCase()
  );
}
