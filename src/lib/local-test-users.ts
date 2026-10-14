export const localTestUsers = {
  superadmin: {
    email: "superadmin.test@localhost",
    name: "Superadmin test",
    role: "superadmin",
  },
  admin: {
    email: "admin.test@localhost",
    name: "Admin test",
    role: "admin",
  },
  seller: {
    email: "predavac.test@localhost",
    name: "Predavač test",
    role: "seller",
  },
} as const;
