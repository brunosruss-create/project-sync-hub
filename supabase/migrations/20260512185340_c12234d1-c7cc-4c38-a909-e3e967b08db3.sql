
-- Enums
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Org Members
CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id AND role IN ('owner','admin')
  );
$$;

-- Profiles policies
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Organizations policies
CREATE POLICY "Members can view their orgs" ON public.organizations FOR SELECT
  USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Authenticated can create orgs" ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Admins can update org" ON public.organizations FOR UPDATE
  USING (public.is_org_admin(auth.uid(), id));
CREATE POLICY "Owners can delete org" ON public.organizations FOR DELETE
  USING (public.has_org_role(auth.uid(), id, 'owner'));

-- Org members policies
CREATE POLICY "Members view org members" ON public.org_members FOR SELECT
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins add members" ON public.org_members FOR INSERT
  WITH CHECK (public.is_org_admin(auth.uid(), org_id) OR auth.uid() = user_id);
CREATE POLICY "Admins update members" ON public.org_members FOR UPDATE
  USING (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "Admins remove members" ON public.org_members FOR DELETE
  USING (public.is_org_admin(auth.uid(), org_id));

-- Trigger: create profile + initial org on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  base_slug TEXT;
  unique_slug TEXT;
  suffix INT := 0;
BEGIN
  -- Profile
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Slug base
  base_slug := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]+', '-', 'g'));
  IF base_slug IS NULL OR base_slug = '' THEN base_slug := 'workspace'; END IF;
  unique_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = unique_slug) LOOP
    suffix := suffix + 1;
    unique_slug := base_slug || '-' || suffix;
  END LOOP;

  -- Initial org
  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s Workspace',
    unique_slug,
    NEW.id
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.org_members (org_id, user_id, role, joined_at)
  VALUES (new_org_id, NEW.id, 'owner', now());

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
