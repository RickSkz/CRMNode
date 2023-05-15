require("dotenv").config();
const tokenVal = require("./tokenValidation");

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.HEROKU_POSTGRESQL_RED_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const baseActivitySelectQuery = "select activity.id, description, client_code, current_status, to_char(action_date, 'YYYY-MM-DD HH:MI:SS') action_date, \
executed, client.name, client.type, client.owner_representative_id, representative.id as representative_id, representative.fname, representative.lname \
from activity \
inner join client on activity.client_code = client.code \
inner join representative on client.owner_representative_id = representative.id";

const baseClientSelectQuery1 = "select client.code as client_code, client.name as client_name, client.owner_representative_id, client.capturing_representative_id, \
client.type, client.note, client.status, client.contact_info, client.products, to_char(anniversary, 'YYYY-MM-DD HH:MI:SS') anniversary, \
r1.fname as owner_representative_fname, r1.lname as owner_representative_lname, r1.contact_info as owner_representative_contact_info, \
r2.fname as capturing_representative_fname, r2.lname as capturing_representative_lname, r2.contact_info as capturing_representative_contact_info \
from client \
inner join representative r1 on r1.id = client.owner_representative_id \
inner join representative r2 on r2.id = client.capturing_representative_id";

const baseClientSelectQuery2 = "group by client.code, client.name, client.owner_representative_id, client.capturing_representative_id, \
client.type, client.note, client.status, client.contact_info, client.products, client.anniversary, r1.fname, r1.lname, r1.contact_info, r2.fname, r2.lname, r2.contact_info"

//Overly complex query. It selects clients that have not had an activity executed for the past 21 days and don't have a planned activity for the next 30 days. 
//It also retrieves the client's last executed activity.
const baseClientSelectUnattendedQuery = "select name as client_name, code as client_code, type, to_char(MAX(activity.action_date), 'YYYY-MM-DD HH:MI:SS') as action_date from client \
left join activity on client.code = activity.client_code \
where status=1 and activity.executed=1 \
and code not in (select client_code from activity where (action_date >= $1 and action_date < $2 and executed = 1) \
or (action_date >= $2 and action_date <= $3)) \
group by client.name, client.code \
order by action_date asc nulls first";

//Retrieves list of active clients without activities planned in the future. 
const baseClientWithoutPlannedActivities = "select name as client_name, code as client_code, type, to_char(MAX(activity.action_date), 'YYYY-MM-DD HH:MI:SS') as action_date from client \
left join activity on client.code = activity.client_code \
where status=1 and activity.executed=1 \
and code not in (select client_code from activity where (action_date >= $1)) \
group by client.name, client.code \
order by action_date asc nulls first";

const baseContactSelectQuery = "select id, fname, lname, email, phone_number, to_char(birthday, 'YYYY-MM-DD HH:MI:SS') birthday, client_code, client.name as client_name \
from contact inner join client on contact.client_code = client.code"

const baseClientFromCurrentUserQuery = "select client.code as code, client.name as name, client.status as status, client.type as type, client.note as note, \
client.owner_representative_id as owner_representative_id, client.capturing_representative_id as capturing_representative_id, \
client.products as products, client.anniversary as anniversary \
from client \
inner join representative r1 on r1.id = client.owner_representative_id \
where r1.contact_info=$1"

const baseConfigVariableSelectQuery = "select * from configvariable"



const getActivities = (request, response) => {
  if (request.query.count) {
    const fromDate = request.query.fromDate;
    const toDate = request.query.toDate;
    query =
      "select count(*) from activity where executed = 0 and action_date between $1 and $2";
    pool.query(query, [fromDate, toDate], (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json(results.rows);
      }
    });
  } else if (request.query.countLagging) {
    const todayDate = request.query.todayDate;
    query =
      "select count(*) from activity where executed = 0 and action_date < $1";
    pool.query(query, [todayDate], (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json(results.rows);
      }
    });
  } else if (request.query.dateConstrained) {
    const fromDate = request.query.fromDate;
    const toDate = request.query.toDate;
    query = baseActivitySelectQuery + " where action_date between $1 and $2 order by action_date desc";
    pool.query(query, [fromDate, toDate], (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        results.rows.map((entry) => {
          entry.representative_name = entry.fname + " " + entry.lname;
        });
        response.status(200).json(results.rows);
      }
    });
  } else if (request.query.all) {
    console.log("Request for all activities")
    query = baseActivitySelectQuery + " order by action_date desc";
    //Get filtering parameters
    let page = Number(request.query.page);
    let filterBySearchBar = Number(request.query.filterBySearchBar);
    let filterByColumns = Number(request.query.filterByColumns);
    let filteredResults = {};
    let tempData = [];
    let rowsPerPage = 10;
    pool.query(query, (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        //Add two custom fields to each entry
        results.rows.map((entry) => {
          entry.representative_name = entry.fname + " " + entry.lname;
        });
        tempData = results.rows;
        //This section filters results by the table's search bar
        if (filterBySearchBar) {
          //If there's a string in the search bar, filter results according to this string
          let searchBarString = request.query.searchBarString;
          console.log("The search string is: " + searchBarString);
          tempData = tempData.filter((entry) => {
            if (
              Object.values(entry)
                .join(":")
                .toLowerCase()
                .includes(searchBarString.toLowerCase())
            ) {
              return true;
            } else {
              return false;
            }
          });
        }

        //This section filters results by the table's column filters 
        if (filterByColumns) {
          console.log(request.query);
          let clientNameFilter = request.query.columnFilter0;
          let clientCodeFilter = request.query.columnFilter1;
          let clientTypeFilter = request.query.columnFilter2;
          let clientOwnerFilter = request.query.columnFilter3;
          let executedFilter = request.query.columnFilter5;

          let filterByClientName = clientNameFilter === "undefined" ? false : true;
          let filterByClientCode = clientCodeFilter === "undefined" ? false : true;
          let filterByClientType = clientTypeFilter === "undefined" ? false : true;
          let filterByClientOwner = clientOwnerFilter === "undefined" ? false : true;
          let filterByExecuted = executedFilter === "undefined" ? false : true;

          //Filter by client name
          if (filterByClientName) {
            tempData = tempData.filter((entry) => {
              let clientName = entry.name.toLowerCase();
              if (clientName.includes(clientNameFilter.toLowerCase())) {
                return true;
              } else {
                return false;
              }
            });
          }
          
          //Filter by client code
          if (filterByClientCode) {
            tempData = tempData.filter((entry) => {
              let clientCode = entry.client_code.toLowerCase();
              if (clientCode.includes(clientCodeFilter.toLowerCase())) {
                return true;
              } else {
                return false;
              }
            });
          }

          //Filter by client type. This one requires special care. 
          if (filterByClientType) {
            tempData = tempData.filter((entry) => {
              let clientType = Number(entry.type) === 1 ? "Ideal" : "No ideal"; 
              if (clientType === clientTypeFilter) {
                return true;
              } else {
                return false;
              }
            });
          }

          //Filter by representative name
          if (filterByClientOwner) {
            tempData = tempData.filter((entry) => {
              let representativeName = entry.representative_name.toLowerCase();
              if (representativeName.includes(clientOwnerFilter.toLowerCase())) {
                return true;
              } else {
                return false;
              }
            });
          }

          //Filter by executed state. This one requires special care. 
          if (filterByExecuted) {
            tempData = tempData.filter((entry) => {
              let executed = Number(entry.executed) === 1 ? "Ejecutado" : "Por ejecutar"; 
              if (executed === executedFilter) {
                return true;
              } else {
                return false;
              }
            });
          }

        }

        //If results are not filtered by search bar or column filters
        if (!filterBySearchBar && !filterByColumns) {
          //If there's no string in the search bar, send all rows
          console.log("There is no search string nor column filters");
        }
        //Number of rows of the filtered results
        filteredResults.count = tempData.length;
        console.log("Number of entries found: " + filteredResults.count);
        console.log("Requested page: " + page);
        //Slicing data to fit page size and page number. This is done in the context of server-side pagination
        let fromRow = page*rowsPerPage;
        let toRow = (page+1)*rowsPerPage;
        filteredResults.data = tempData.slice(fromRow, toRow);
        console.log("Data cut from row " + fromRow + " to row " + toRow);
        response.status(200).json(filteredResults);
      }
    });
  } else if (request.query.lagging) {
      console.log("Request for lagging activities")
      const todayDate = request.query.todayDate;
      query = baseActivitySelectQuery + " where executed = 0 and action_date < $1 order by action_date desc";
      //Get filtering parameters
      let page = Number(request.query.page);
      let filterBySearchBar = Number(request.query.filterBySearchBar);
      let filterByColumns = Number(request.query.filterByColumns);
      let filteredResults = {};
      let tempData = [];
      let rowsPerPage = 10;
      pool.query(query, [todayDate], (error, results) => {
        if (error) {
          console.log(error);
          response.status(403).json([]);
        } else {
          //Add two custom fields to each entry
          console.log(results.rows);
          results.rows.map((entry) => {
            entry.representative_name = entry.fname + " " + entry.lname;
          });
          tempData = results.rows;
          //This section filters results by the table's search bar
          if (filterBySearchBar) {
            //If there's a string in the search bar, filter results according to this string
            let searchBarString = request.query.searchBarString;
            console.log("The search string is: " + searchBarString);
            tempData = tempData.filter((entry) => {
              if (
                Object.values(entry)
                  .join(":")
                  .toLowerCase()
                  .includes(searchBarString.toLowerCase())
              ) {
                return true;
              } else {
                return false;
              }
            });
          }

          //This section filters results by the table's column filters 
          if (filterByColumns) {
            console.log(request.query);
            let clientNameFilter = request.query.columnFilter0;
            let clientCodeFilter = request.query.columnFilter1;
            let clientTypeFilter = request.query.columnFilter2;
            let clientOwnerFilter = request.query.columnFilter3;
            let executedFilter = request.query.columnFilter5;

            let filterByClientName = clientNameFilter === "undefined" ? false : true;
            let filterByClientCode = clientCodeFilter === "undefined" ? false : true;
            let filterByClientType = clientTypeFilter === "undefined" ? false : true;
            let filterByClientOwner = clientOwnerFilter === "undefined" ? false : true;
            let filterByExecuted = executedFilter === "undefined" ? false : true;

            //Filter by client name
            if (filterByClientName) {
              tempData = tempData.filter((entry) => {
                let clientName = entry.name.toLowerCase();
                if (clientName.includes(clientNameFilter.toLowerCase())) {
                  return true;
                } else {
                  return false;
                }
              });
            } 
            //Filter by client code
            if (filterByClientCode) {
              tempData = tempData.filter((entry) => {
                let clientCode = entry.client_code.toLowerCase();
                if (clientCode.includes(clientCodeFilter.toLowerCase())) {
                  return true;
                } else {
                  return false;
                }
              });
            }
            //Filter by client type. This one requires special care. 
            if (filterByClientType) {
              tempData = tempData.filter((entry) => {
                let clientType = Number(entry.type) === 1 ? "Ideal" : "No ideal"; 
                if (clientType === clientTypeFilter) {
                  return true;
                } else {
                  return false;
                }
              });
            }
            //Filter by representative name
            if (filterByClientOwner) {
              tempData = tempData.filter((entry) => {
                let representativeName = entry.representative_name.toLowerCase();
                if (representativeName.includes(clientOwnerFilter.toLowerCase())) {
                  return true;
                } else {
                  return false;
                }
              });
            }
            //Filter by executed state. This one requires special care. 
            if (filterByExecuted) {
              tempData = tempData.filter((entry) => {
                let executed = Number(entry.executed) === 1 ? "Ejecutado" : "Por ejecutar"; 
                if (executed === executedFilter) {
                  return true;
                } else {
                  return false;
                }
              });
            }
          }
          //If results are not filtered by search bar or column filters
          if (!filterBySearchBar && !filterByColumns) {
            //If there's no string in the search bar, send all rows
            console.log("There is no search string nor column filters");
          }
          //Number of rows of the filtered results
          filteredResults.count = tempData.length;
          console.log("Number of entries found: " + filteredResults.count);
          console.log("Requested page: " + page);
          //Slicing data to fit page size and page number. This is done in the context of server-side pagination
          let fromRow = page*rowsPerPage;
          let toRow = (page+1)*rowsPerPage;
          filteredResults.data = tempData.slice(fromRow, toRow);
          console.log("Data cut from row " + fromRow + " to row " + toRow);
          response.status(200).json(filteredResults);
        }
      });
  } 
};

const createActivity = (request, response) => {
  const {
    client_code,
    current_status,
    description,
    action_date,
    executed,
  } = request.body;
  pool.query(
    "INSERT INTO Activity (client_code, current_status, description, action_date, create_date, executed) values ($1, $2, $3, $4, $5, $6)",
    [
      client_code,
      current_status,
      description,
      action_date,
      new Date().toLocaleDateString("fr-CA", {timeZone: "America/Caracas"}),
      executed,
    ],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Activity created",
        });
      }
    }
  );
};

const deleteActivity = (request, response) => {
  const id = request.param("id");
  pool.query("DELETE FROM activity WHERE id = $1", [id], (error, results) => {
    if (error) {
      console.log(error);
      response.status(403).json([]);
    } else {
      response.status(200).json({
        message: "Activity deleted with ID: " + id,
      });
    }
  });
};

const updateActivity = (request, response) => {
  const {
    client_code,
    current_status,
    description,
    action_date,
    executed,
    id,
  } = request.body;
  pool.query(
    "UPDATE activity SET client_code=$1, current_status=$2, description=$3, action_date=$4, executed=$5 WHERE id = $6",
    [
      client_code,
      current_status,
      description,
      action_date,
      executed,
      id,
    ],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Activity updated with ID: " + id,
        });
      }
    }
  );
};

const getRepresentatives = (request, response) => {
    let query = "SELECT * FROM Representative";
    pool.query(query, (error, results) => {
      if (error) {
        response.status(403).json([]);
      } else {
        response.status(200).json(results.rows);
      }
    });
};

const createRepresentative = (request, response) => {
  const { fname, lname, contact_info, note, status } = request.body;
  pool.query(
    "INSERT INTO Representative (fname, lname, contact_info, note, status) values ($1, $2, $3, $4, $5)",
    [fname, lname, contact_info, note, status],
    (error, results) => {
      if (error) {
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Representative created",
        });
      }
    }
  );
};

const deleteRepresentative = (request, response) => {
  const id = request.query.id;
  pool.query(
    "DELETE FROM representative WHERE id = $1",
    [id],
    (error, results) => {
      if (error) {
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Representative deleted with ID: " + id,
        });
      }
    }
  );
};

const updateRepresentative = (request, response) => {
  const { fname, lname, contact_info, note, status, id } = request.body;
  pool.query(
    "UPDATE representative SET fname=$1, lname=$2, contact_info=$3, note=$4, status=$5 WHERE id = $6",
    [fname, lname, contact_info, note, status, id],
    (error, results) => {
      if (error) {
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Representative updated with ID: " + id,
        });
      }
    }
  );
};

const getClients = (request, response) => {
  if (request.query.unattended) {
    let lowerThresholdDate = request.query.lowerThresholdDate;
    let upperThresholdDate = request.query.upperThresholdDate;
    let today = request.query.today;
    let query = baseClientSelectUnattendedQuery;
    pool.query(query, [lowerThresholdDate, today, upperThresholdDate], (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        results.rows.map((entry) => {
          if (!entry.action_date) {
            entry.action_date = null
          }
        });
        response.status(200).json(results.rows);
      }
    });
  } else if (request.query.ownerRepresentative) { 
    const ownerRepresentativeEmail = request.query.ownerRepresentativeEmail;
    pool.query(baseClientSelectQuery1 + " where r1.contact_info=$1 " + baseClientSelectQuery2, [ownerRepresentativeEmail], (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        results.rows.map((entry) => {
          entry.owner_representative_name = entry.owner_representative_fname + " " + entry.owner_representative_lname;
          entry.capturing_representative_name = entry.capturing_representative_fname + " " + entry.capturing_representative_lname;
        });
        response.status(200).json(results.rows);
      }
    });
  } else if (request.query.countStatus) {
    const status = request.query.status;
    let query = "select count(*) from client where status=$1";
    pool.query(query, [status], (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json(results.rows);
      }
    });
  } else if (request.query.lastActivities) {
    const thresholdDate = request.query.thresholdDate;
    const code = request.query.code;
    pool.query(
      baseActivitySelectQuery + " where client_code = $1 and action_date <= $2 and executed = 1 order by action_date desc limit 3",
      [code, thresholdDate],
      (error, results) => {
        if (error) {
          console.log(error);
          response.status(403).json([]);
        } else {
          response.status(200).json(results.rows);
        }
      }
    );
  } else if (request.query.nextActivities) {
    const thresholdDate = request.query.thresholdDate;
    const code = request.query.code;
    pool.query(
      baseActivitySelectQuery + " where client_code = $1 and action_date >= $2 and executed = 0 order by action_date asc limit 3",
      [code, thresholdDate],
      (error, results) => {
        if (error) {
          console.log(error);
          response.status(403).json([]);
        } else {
          response.status(200).json(results.rows);
        }
      }
    );
  } else if (request.query.noPlannedActivities) {
    let today = new Date().toLocaleString("fr-CA", {timeZone: "America/Caracas"});
      pool.query(
        baseClientWithoutPlannedActivities,
        [today],
        (error, results) => {
          if (error) {
            console.log(error);
            response.status(403).json([]);
          } else {
            response.status(200).json(results.rows);
          }
        }
      );
  } else {
    pool.query(baseClientSelectQuery1 + " " + baseClientSelectQuery2, (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        results.rows.map((entry) => {
          entry.owner_representative_name = entry.owner_representative_fname + " " + entry.owner_representative_lname;
          entry.capturing_representative_name = entry.capturing_representative_fname + " " + entry.capturing_representative_lname;
        });
        response.status(200).json(results.rows);
      }
    });
  }
};

const createClient = (request, response) => {
  const { client_code, client_name, owner_representative_id, capturing_representative_id, contact_info, anniversary, note, products, status, type } = request.body;
  pool.query(
    "INSERT INTO Client (code, name, owner_representative_id, capturing_representative_id, contact_info, anniversary, note, products, type, status) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    [client_code, client_name, owner_representative_id, capturing_representative_id, contact_info, anniversary, note, products, type, status],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Client created",
        });
      }
    }
  );
};

const deleteClient = (request, response) => {
  const client_code = request.param("code");
  pool.query("DELETE FROM client WHERE code = $1", [client_code], (error, results) => {
    if (error) {
      console.log(error);
      response.status(403).json([]);
    } else {
      response.status(200).json({
        message: "Client deleted with code: " + client_code,
      });
    }
  });
};

const updateClient = (request, response) => {
  const { client_code, client_name, owner_representative_id, capturing_representative_id, contact_info, anniversary, note, products, status, type } = request.body;
  pool.query(
    "UPDATE client SET name=$1, owner_representative_id=$2, capturing_representative_id=$3, contact_info=$4, anniversary=$5, note=$6, type=$7, products=$8, status=$9 WHERE code = $10",
    [client_name, owner_representative_id, capturing_representative_id, contact_info, anniversary, note, type, products, status, client_code],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Client updated with code: " + client_code,
        });
      }
    }
  );
};

const getAppLogs = (request, response) => {
  let query =
      "select log_type, log_description, to_char(log_date, 'YYYY-MM-DD HH:MI:SS') log_date from applog order by log_date desc";
    pool.query(query, (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json(results.rows);
      }
    });
};

const createAppLog = (request, response) => {
  const { log_type, log_description, log_date } = request.body;
  pool.query(
    "INSERT INTO applog (log_type, log_description, log_date) values ($1, $2, $3)",
    [log_type, log_description, log_date],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "AppLog created",
        });
      }
    }
  );
};

const getAppUsers = (request, response) => {
    pool.query("SELECT id, to_char(last_seen, 'DD-MM-YYYY HH12:MI PM') last_seen, email, privilege_level, note FROM AppUser \
    order by privilege_level desc", (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json(results.rows);
      }
    });
};

const getAppUserPrivileges = (request, response) => {
  const { email } = request.body;
  pool.query("SELECT * FROM AppUser where email = $1", [email], (error, results) => {
    if (error) {
      console.log(error);
      response.status(403).json([]);
    } else {
      response.status(200).json(results.rows);
    }
  });
}

const createAppUser = (request, response) => {
  const { email, privilege_level, note } = request.body;
  pool.query(
    "INSERT INTO AppUser (email, privilege_level, note) values ($1, $2, $3)",
    [email, privilege_level, note],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "AppUser created",
        });
      }
    }
  );
};

const deleteAppUser = (request, response) => {
  const id = request.query.id;
  pool.query(
    "DELETE FROM appuser WHERE id = $1",
    [id],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "AppUser deleted with ID: " + id,
        });
      }
    }
  );
};

const updateAppUser = (request, response) => {
  const { email, privilege_level, note, id } = request.body;
  pool.query(
    "UPDATE appuser SET email=$1, privilege_level=$2, note=$3 WHERE id = $4",
    [email, privilege_level, note, id],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "AppUser updated with ID: " + id,
        });
      }
    }
  );
};

const getContacts = (request, response) => {
  if (request.query.fromClient) {
    const clientCode = request.query.clientCode;
    pool.query(baseContactSelectQuery + " where client_code=$1", [clientCode], (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json(results.rows);
      }
    });
  } else {
    pool.query(baseContactSelectQuery, (error, results) => {
      if (error) {
        response.status(403).json([]);
      } else {
        response.status(200).json(results.rows);
      }
    });
  }
};

const createContact = (request, response) => {
  const { fname, lname, email, phone_number, birthday, client_code } = request.body;
  pool.query(
    "INSERT INTO contact (fname, lname, email, phone_number, birthday, client_code) values ($1, $2, $3, $4, $5, $6)",
    [fname, lname, email, phone_number, birthday, client_code],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Contact created",
        });
      }
    }
  );
};

const deleteContact = (request, response) => {
  const id = request.query.id;
  pool.query(
    "DELETE FROM contact WHERE id = $1",
    [id],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Contact deleted with ID: " + id,
        });
      }
    }
  );
};

const updateContact = (request, response) => {
  const { fname, lname, email, phone_number, birthday, client_code, id } = request.body;
  pool.query(
    "UPDATE contact SET fname=$1, lname=$2, email=$3, phone_number=$4, birthday=$5, client_code=$6 WHERE id = $7",
    [fname, lname, email, phone_number, birthday, client_code, id],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "Contact updated with ID: " + id,
        });
      }
    }
  );
};

const getConfigVariables = (request, response) => {
  pool.query(baseConfigVariableSelectQuery, (error, results) => {
    if (error) {
      console.log(error);
      response.status(403).json([]);
    } else {
      response.status(200).json(results.rows);
    }
  });
};

const createConfigVariable = (request, response) => {
  const { name, value } = request.body;
  pool.query(
    "INSERT INTO configvariable (email, company_anniversary, contact_birthday, unattended_clients) values ($1, $2, $3, $4)",
    [name, value],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "ConfigVariable created",
        });
      }
    }
  );
};

const deleteConfigVariable = (request, response) => {
};

const updateConfigVariable = (request, response) => {
  const { email, company_anniversary, contact_birthday, unattended_clients, day_activities, unexecuted_activities, id } = request.body;
  pool.query(
    "UPDATE configvariable SET email=$1, company_anniversary=$2, contact_birthday=$3, unattended_clients=$4, day_activities=$5, unexecuted_activities=$6 WHERE id = $7",
    [email, company_anniversary, contact_birthday, unattended_clients, day_activities, unexecuted_activities, id],
    (error, results) => {
      if (error) {
        console.log(error);
        response.status(403).json([]);
      } else {
        response.status(200).json({
          message: "ConfigVariables updated",
        });
      }
    }
  );
};

const getTodayAnniversaries = (sendNotification) => {
  let today = new Date().toLocaleString("en-US", {day: '2-digit', month: '2-digit', timeZone: "America/Caracas"}); //Get the date in MM/DD shape
  pool.query(
    "select * from client where to_char(anniversary, 'MM/DD') = $1",
    [today],
    (error, results) => {
      if (error) {
        console.log(error);
      } else {
        sendNotification(results.rows);
      }
    }
  );
}

const getTodayBirthdays = (sendNotification) => {
  let today = new Date().toLocaleString("en-US", {day: '2-digit', month: '2-digit', timeZone: "America/Caracas"}); //Get the date in MM/DD shape
  pool.query(
    "select fname, lname, client.name as client_name from contact inner join client on contact.client_code = client.code where to_char(contact.birthday, 'MM/DD') = $1",
    [today],
    (error, results) => {
      if (error) {
        console.log(error);
      } else {
        sendNotification(results.rows);
      }
    }

  );
}

const getTomorrowActivitiesLocally = (sendNotification) => {
  let tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow = tomorrow.toLocaleDateString("fr-CA", {timeZone: "America/Caracas"}); //Get tomorrow's date
  let query = "select activity.description, activity.client_code, activity.current_status, client.name as client_name \
        from activity inner join client on activity.client_code = client.code where activity.action_date=$1"
  pool.query(
    query,
    [tomorrow],
    (error, results) => {
      if (error) {
        console.log(error);
      } else {
        sendNotification(results.rows);
      }
    }

  );
}

const getYesterdayUnexecutedActivitiesLocally = (sendNotification) => {
  let yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday = yesterday.toLocaleDateString("fr-CA", {timeZone: "America/Caracas"}); //Get yesterday's date
  let query = "select activity.description, activity.client_code, activity.current_status, client.name as client_name \
        from activity inner join client on activity.client_code = client.code where activity.action_date=$1 and activity.executed=0"
  pool.query(
    query,
    [yesterday],
    (error, results) => {
      if (error) {
        console.log(error);
      } else {
        sendNotification(results.rows);
      }
    }

  );
}
 
//Get unattended clients to be used in the backend
const getUnattendedClientsLocally = (sendNotification) => {
  let today = new Date().toLocaleString("fr-CA", {timeZone: "America/Caracas"});
  let lowerThresholdDate = new Date();
  lowerThresholdDate.setDate(lowerThresholdDate.getDate() - 21);
  lowerThresholdDate = lowerThresholdDate.toLocaleString("fr-CA", {timeZone: "America/Caracas"});
  let upperThresholdDate = new Date();
  upperThresholdDate.setDate(upperThresholdDate.getDate() + 31);
  upperThresholdDate.toLocaleString("fr-CA", {timeZone: "America/Caracas"});
  pool.query(
    baseClientSelectUnattendedQuery,
    [lowerThresholdDate, today, upperThresholdDate],
    (error, results) => {
      if (error) {
        console.log(error);
      } else {
        sendNotification(results.rows);
      }
    }
  );
}


//Get configuration variables to be used in the backend
const getConfigVariablesLocally = (dailyCheck) => {
  pool.query(
    "select * from configvariable where id = 1",
    (error, results) => {
      if (error) {
        console.log(error);
      } else {
        let ob = {
          anniversariesFlag: Number(results.rows[0].company_anniversary),
          birthdaysFlag: Number(results.rows[0].contact_birthday),
          unattendedFlag: Number(results.rows[0].unattended_clients),
          dayActivitiesFlag: Number(results.rows[0].day_activities),
          unexecutedActivitiesFlag: Number(results.rows[0].unexecuted_activities),
          recipientEmail: results.rows[0].email,
        };
        dailyCheck(ob);
      }
    }
  );
}

//Get a user's privileges for the backend, and then continue to the input function
const getAppUserFromEmailLocally = (email) => {
  return pool.query("SELECT * FROM AppUser where email = $1", [email]);
}

//Get a user's privileges for the backend, and then continue to the input function
const getRepresentativeFromEmailLocally = (email) => {
  return pool.query("SELECT * FROM Representative where contact_info = $1", [email]);
}

//Update a user's last seen date
const setAppUserLastSeenLocally = (date, email) => {
  return pool.query("UPDATE AppUser SET last_seen=$1 where email=$2", [date, email]);
}

module.exports = {
  getActivities,
  createActivity,
  deleteActivity,
  updateActivity,
  getRepresentatives,
  createRepresentative,
  deleteRepresentative,
  updateRepresentative,
  getClients,
  createClient,
  deleteClient,
  updateClient,
  getAppLogs,
  createAppLog,
  getAppUsers,
  getAppUserPrivileges,
  createAppUser,
  deleteAppUser,
  updateAppUser,
  getContacts,
  createContact,
  deleteContact,
  updateContact,
  getConfigVariables,
  createConfigVariable,
  deleteConfigVariable,
  updateConfigVariable,
  getTodayAnniversaries,
  getTodayBirthdays,
  getTomorrowActivitiesLocally,
  getYesterdayUnexecutedActivitiesLocally,
  getUnattendedClientsLocally,
  getConfigVariablesLocally,
  getAppUserFromEmailLocally,
  getRepresentativeFromEmailLocally,
  setAppUserLastSeenLocally,
};

//https://blog.logrocket.com/setting-up-a-restful-api-with-node-js-and-postgresql-d96d6fc892d8/
