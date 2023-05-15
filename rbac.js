const rules = {
    //User with low privileges
    0: {
      static: [
        "clients:read",
        "activities:read",
        "representatives:read",
        "contacts:read",
      ],
      dynamic: {
        "activities:edit": ({ userEmail, clientOwnerEmail }) => {
          if (!userEmail || !clientOwnerEmail) return false;
          return userEmail === clientOwnerEmail;
        },
        // "clients:edit": ({ userEmail, clientOwnerEmail }) => {
        //   if (!userEmail || !clientOwnerEmail) return false;
        //   return userEmail === clientOwnerEmail;
        // },
      },
    },
    //User with high privileges
    1: {
      static: [
        "clients:read",
        "clients:edit",
        "activities:read",
        "activities:edit",
        "representatives:read",
        "representatives:edit",
        "contacts:read",
        "contacts:edit",
        "logs:read",
      ],
    },
    //Admin
    2: {
      static: [
        "clients:read",
        "clients:edit",
        "activities:read",
        "activities:edit",
        "representatives:read",
        "representatives:edit",
        "contacts:read",
        "contacts:edit",
        "logs:read",
        "adminDashboard:read",
        "appUsers:read",
        "appUsers:edit"
      ],
    },
  };
  
module.exports = {
   rules
}
  
  //https://auth0.com/blog/role-based-access-control-rbac-and-react-apps/