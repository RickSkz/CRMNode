create table configvariable (
    id serial primary key, 
    email varchar(100),
    company_anniversary numeric(1),
    contact_birthday numeric(1),
    unattended_clients numeric(1)
);

insert into configvariable (id, email, company_anniversary, contact_birthday, unattended_clients) values (1,'', 1, 1, 0);