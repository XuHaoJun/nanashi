--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

SET search_path = public, pg_catalog;

ALTER TABLE ONLY public.card_party_info DROP CONSTRAINT card_party_info_account_id_fkey;
ALTER TABLE ONLY public.card_party DROP CONSTRAINT card_party_card_party_info_id_fkey;
ALTER TABLE ONLY public.card_party DROP CONSTRAINT card_party_card_id_fkey;
ALTER TABLE ONLY public.card DROP CONSTRAINT card_base_card_id_fkey;
ALTER TABLE ONLY public.card DROP CONSTRAINT card_account_id_fkey;
ALTER TABLE ONLY public.battle_pc2npc_1v1 DROP CONSTRAINT battle_pc2npc_1v1_account_id_fkey;
ALTER TABLE ONLY public.battle_pc2npc_1v1 DROP CONSTRAINT pc2npc_1v1_pkey;
ALTER TABLE ONLY public.card DROP CONSTRAINT card_pkey1;
ALTER TABLE ONLY public.base_card DROP CONSTRAINT card_pkey;
ALTER TABLE ONLY public.card_party DROP CONSTRAINT card_party_pkey;
ALTER TABLE ONLY public.card_party_info DROP CONSTRAINT card_party_info_pkey;
ALTER TABLE ONLY public.battle_pc2npc_1v1 DROP CONSTRAINT battle_pc2npc_1v1_account_id_key;
ALTER TABLE ONLY public.account DROP CONSTRAINT account_username_key;
ALTER TABLE ONLY public.account DROP CONSTRAINT account_pkey;
ALTER TABLE ONLY public.account DROP CONSTRAINT account_email_key;
ALTER TABLE public.card_party_info ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.card_party ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.card ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.battle_pc2npc_1v1 ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.base_card ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.account ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE public.pc2npc_1v1_id_seq;
DROP SEQUENCE public.card_party_info_id_new_seq;
DROP TABLE public.card_party_info;
DROP SEQUENCE public.card_party_id_seq;
DROP TABLE public.card_party;
DROP SEQUENCE public.card_id_seq1;
DROP SEQUENCE public.card_id_seq;
DROP TABLE public.card;
DROP TABLE public.battle_pc2npc_1v1;
DROP TABLE public.base_card;
DROP SEQUENCE public.account_id_seq;
DROP TABLE public.account;
DROP EXTENSION plpgsql;
DROP SCHEMA public;
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: plpgsql; Type: EXTENSION; Schema: -; Owner: 
--

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;


--
-- Name: EXTENSION plpgsql; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';


SET search_path = public, pg_catalog;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: account; Type: TABLE; Schema: public; Owner: xuhaojun; Tablespace: 
--

CREATE TABLE account (
    id integer NOT NULL,
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    "group" integer DEFAULT 0 NOT NULL,
    money integer DEFAULT 0 NOT NULL,
    cry integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    account_provider_name character varying(255) DEFAULT 'local'::character varying NOT NULL
);


ALTER TABLE account OWNER TO xuhaojun;

--
-- Name: account_id_seq; Type: SEQUENCE; Schema: public; Owner: xuhaojun
--

CREATE SEQUENCE account_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE account_id_seq OWNER TO xuhaojun;

--
-- Name: account_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xuhaojun
--

ALTER SEQUENCE account_id_seq OWNED BY account.id;


--
-- Name: base_card; Type: TABLE; Schema: public; Owner: xuhaojun; Tablespace: 
--

CREATE TABLE base_card (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    rea character varying(10) NOT NULL,
    hp integer DEFAULT 0,
    spd integer DEFAULT 0,
    atk integer DEFAULT 0,
    def integer DEFAULT 0,
    tp character varying(255) DEFAULT ''::character varying NOT NULL,
    skill1 integer DEFAULT 0,
    skill2 integer DEFAULT 0,
    skill3 integer DEFAULT 0,
    skill4 integer DEFAULT 0
);


ALTER TABLE base_card OWNER TO xuhaojun;

--
-- Name: battle_pc2npc_1v1; Type: TABLE; Schema: public; Owner: xuhaojun; Tablespace: 
--

CREATE TABLE battle_pc2npc_1v1 (
    id integer NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    npc_id integer NOT NULL,
    account_id integer NOT NULL,
    npc_battle_card_party_info jsonb NOT NULL,
    account_battle_card_party_info jsonb NOT NULL,
    merged_card_party_order jsonb NOT NULL
);


ALTER TABLE battle_pc2npc_1v1 OWNER TO xuhaojun;

--
-- Name: card; Type: TABLE; Schema: public; Owner: xuhaojun; Tablespace: 
--

CREATE TABLE card (
    id integer NOT NULL,
    account_id integer NOT NULL,
    base_card_id integer NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    hp_effort integer DEFAULT 0 NOT NULL,
    atk_effort integer DEFAULT 0 NOT NULL,
    def_effort integer DEFAULT 0 NOT NULL,
    spd_effort integer DEFAULT 0 NOT NULL,
    skill1 integer DEFAULT 0 NOT NULL,
    skill2 integer DEFAULT 0 NOT NULL,
    skill3 integer DEFAULT 0 NOT NULL,
    skill4 integer DEFAULT 0 NOT NULL
);


ALTER TABLE card OWNER TO xuhaojun;

--
-- Name: card_id_seq; Type: SEQUENCE; Schema: public; Owner: xuhaojun
--

CREATE SEQUENCE card_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE card_id_seq OWNER TO xuhaojun;

--
-- Name: card_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xuhaojun
--

ALTER SEQUENCE card_id_seq OWNED BY base_card.id;


--
-- Name: card_id_seq1; Type: SEQUENCE; Schema: public; Owner: xuhaojun
--

CREATE SEQUENCE card_id_seq1
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE card_id_seq1 OWNER TO xuhaojun;

--
-- Name: card_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: xuhaojun
--

ALTER SEQUENCE card_id_seq1 OWNED BY card.id;


--
-- Name: card_party; Type: TABLE; Schema: public; Owner: xuhaojun; Tablespace: 
--

CREATE TABLE card_party (
    id integer NOT NULL,
    card_party_info_id integer NOT NULL,
    card_id integer NOT NULL,
    slot_index integer NOT NULL
);


ALTER TABLE card_party OWNER TO xuhaojun;

--
-- Name: card_party_id_seq; Type: SEQUENCE; Schema: public; Owner: xuhaojun
--

CREATE SEQUENCE card_party_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE card_party_id_seq OWNER TO xuhaojun;

--
-- Name: card_party_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xuhaojun
--

ALTER SEQUENCE card_party_id_seq OWNED BY card_party.id;


--
-- Name: card_party_info; Type: TABLE; Schema: public; Owner: xuhaojun; Tablespace: 
--

CREATE TABLE card_party_info (
    id integer NOT NULL,
    account_id integer NOT NULL,
    name character varying(255) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE card_party_info OWNER TO xuhaojun;

--
-- Name: card_party_info_id_new_seq; Type: SEQUENCE; Schema: public; Owner: xuhaojun
--

CREATE SEQUENCE card_party_info_id_new_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE card_party_info_id_new_seq OWNER TO xuhaojun;

--
-- Name: card_party_info_id_new_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xuhaojun
--

ALTER SEQUENCE card_party_info_id_new_seq OWNED BY card_party_info.id;


--
-- Name: pc2npc_1v1_id_seq; Type: SEQUENCE; Schema: public; Owner: xuhaojun
--

CREATE SEQUENCE pc2npc_1v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE pc2npc_1v1_id_seq OWNER TO xuhaojun;

--
-- Name: pc2npc_1v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: xuhaojun
--

ALTER SEQUENCE pc2npc_1v1_id_seq OWNED BY battle_pc2npc_1v1.id;


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY account ALTER COLUMN id SET DEFAULT nextval('account_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY base_card ALTER COLUMN id SET DEFAULT nextval('card_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY battle_pc2npc_1v1 ALTER COLUMN id SET DEFAULT nextval('pc2npc_1v1_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY card ALTER COLUMN id SET DEFAULT nextval('card_id_seq1'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY card_party ALTER COLUMN id SET DEFAULT nextval('card_party_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY card_party_info ALTER COLUMN id SET DEFAULT nextval('card_party_info_id_new_seq'::regclass);


--
-- Name: account_email_key; Type: CONSTRAINT; Schema: public; Owner: xuhaojun; Tablespace: 
--

ALTER TABLE ONLY account
    ADD CONSTRAINT account_email_key UNIQUE (email);


--
-- Name: account_pkey; Type: CONSTRAINT; Schema: public; Owner: xuhaojun; Tablespace: 
--

ALTER TABLE ONLY account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: account_username_key; Type: CONSTRAINT; Schema: public; Owner: xuhaojun; Tablespace: 
--

ALTER TABLE ONLY account
    ADD CONSTRAINT account_username_key UNIQUE (username);


--
-- Name: battle_pc2npc_1v1_account_id_key; Type: CONSTRAINT; Schema: public; Owner: xuhaojun; Tablespace: 
--

ALTER TABLE ONLY battle_pc2npc_1v1
    ADD CONSTRAINT battle_pc2npc_1v1_account_id_key UNIQUE (account_id);


--
-- Name: card_party_info_pkey; Type: CONSTRAINT; Schema: public; Owner: xuhaojun; Tablespace: 
--

ALTER TABLE ONLY card_party_info
    ADD CONSTRAINT card_party_info_pkey PRIMARY KEY (id);


--
-- Name: card_party_pkey; Type: CONSTRAINT; Schema: public; Owner: xuhaojun; Tablespace: 
--

ALTER TABLE ONLY card_party
    ADD CONSTRAINT card_party_pkey PRIMARY KEY (id);


--
-- Name: card_pkey; Type: CONSTRAINT; Schema: public; Owner: xuhaojun; Tablespace: 
--

ALTER TABLE ONLY base_card
    ADD CONSTRAINT card_pkey PRIMARY KEY (id);


--
-- Name: card_pkey1; Type: CONSTRAINT; Schema: public; Owner: xuhaojun; Tablespace: 
--

ALTER TABLE ONLY card
    ADD CONSTRAINT card_pkey1 PRIMARY KEY (id);


--
-- Name: pc2npc_1v1_pkey; Type: CONSTRAINT; Schema: public; Owner: xuhaojun; Tablespace: 
--

ALTER TABLE ONLY battle_pc2npc_1v1
    ADD CONSTRAINT pc2npc_1v1_pkey PRIMARY KEY (id);


--
-- Name: battle_pc2npc_1v1_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY battle_pc2npc_1v1
    ADD CONSTRAINT battle_pc2npc_1v1_account_id_fkey FOREIGN KEY (account_id) REFERENCES account(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: card_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY card
    ADD CONSTRAINT card_account_id_fkey FOREIGN KEY (account_id) REFERENCES account(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: card_base_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY card
    ADD CONSTRAINT card_base_card_id_fkey FOREIGN KEY (base_card_id) REFERENCES base_card(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: card_party_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY card_party
    ADD CONSTRAINT card_party_card_id_fkey FOREIGN KEY (card_id) REFERENCES card(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: card_party_card_party_info_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY card_party
    ADD CONSTRAINT card_party_card_party_info_id_fkey FOREIGN KEY (card_party_info_id) REFERENCES card_party_info(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: card_party_info_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xuhaojun
--

ALTER TABLE ONLY card_party_info
    ADD CONSTRAINT card_party_info_account_id_fkey FOREIGN KEY (account_id) REFERENCES account(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM postgres;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

