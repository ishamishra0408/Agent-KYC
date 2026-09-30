// Sample loads for the demo. Made up.
export interface Load {
  id: string;
  from: string;
  to: string;
  vehicle: string;
  when: string;
  fare: number; // rupees
  distanceKm: number;
}

export const LOADS: Load[] = [
  { id: "L1", from: "Whitefield", to: "Hosur", vehicle: "Tata Ace", when: "Today, 4 PM", fare: 1450, distanceKm: 38 },
  { id: "L2", from: "Peenya", to: "KR Puram", vehicle: "Pickup", when: "Today, 6 PM", fare: 980, distanceKm: 24 },
  { id: "L3", from: "Electronic City", to: "Yelahanka", vehicle: "14 ft truck", when: "Tomorrow, 9 AM", fare: 2600, distanceKm: 46 },
  { id: "L4", from: "Hebbal", to: "Tumakuru", vehicle: "Tata Ace", when: "Tomorrow, 11 AM", fare: 3100, distanceKm: 70 },
];
