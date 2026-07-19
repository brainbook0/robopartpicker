export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      build_comments: {
        Row: {
          body: string
          build_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          build_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          body?: string
          build_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_comments_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      build_likes: {
        Row: {
          build_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          build_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          build_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_likes_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      build_parts: {
        Row: {
          build_id: string
          created_at: string
          id: string
          notes: string | null
          part_id: string
          position: number
          quantity: number
        }
        Insert: {
          build_id: string
          created_at?: string
          id?: string
          notes?: string | null
          part_id: string
          position?: number
          quantity?: number
        }
        Update: {
          build_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          part_id?: string
          position?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "build_parts_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      builds: {
        Row: {
          created_at: string
          description: string | null
          fork_of: string | null
          id: string
          is_public: boolean
          like_count: number
          name: string
          slug: string
          total_cost_high: number
          total_cost_low: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fork_of?: string | null
          id?: string
          is_public?: boolean
          like_count?: number
          name: string
          slug: string
          total_cost_high?: number
          total_cost_low?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fork_of?: string | null
          id?: string
          is_public?: boolean
          like_count?: number
          name?: string
          slug?: string
          total_cost_high?: number
          total_cost_low?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builds_fork_of_fkey"
            columns: ["fork_of"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts: Json
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      compatibility_tags: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          label: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          slug?: string
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          body: string
          buyer_user_id: string
          created_at: string
          id: string
          listing_id: string
          seller_user_id: string
        }
        Insert: {
          body: string
          buyer_user_id: string
          created_at?: string
          id?: string
          listing_id: string
          seller_user_id: string
        }
        Update: {
          body?: string
          buyer_user_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          seller_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      forum_posts: {
        Row: {
          body: string
          created_at: string
          edited_at: string | null
          id: string
          parent_id: string | null
          reaction_count: number
          thread_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          reaction_count?: number
          thread_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          reaction_count?: number
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_posts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "forum_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string | null
          thread_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_id?: string | null
          thread_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string | null
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_reactions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "forum_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_threads: {
        Row: {
          accepted_post_id: string | null
          body: string
          category_id: string
          created_at: string
          id: string
          last_activity_at: string
          linked_entity_label: string | null
          linked_entity_path: string | null
          locked: boolean
          pinned: boolean
          reaction_count: number
          related_entity_id: string | null
          related_entity_type: string | null
          reply_count: number
          slug: string
          status: string
          structured_data: Json
          tags: string[]
          thread_type: string
          title: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          accepted_post_id?: string | null
          body?: string
          category_id: string
          created_at?: string
          id?: string
          last_activity_at?: string
          linked_entity_label?: string | null
          linked_entity_path?: string | null
          locked?: boolean
          pinned?: boolean
          reaction_count?: number
          related_entity_id?: string | null
          related_entity_type?: string | null
          reply_count?: number
          slug: string
          status?: string
          structured_data?: Json
          tags?: string[]
          thread_type?: string
          title: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          accepted_post_id?: string | null
          body?: string
          category_id?: string
          created_at?: string
          id?: string
          last_activity_at?: string
          linked_entity_label?: string | null
          linked_entity_path?: string | null
          locked?: boolean
          pinned?: boolean
          reaction_count?: number
          related_entity_id?: string | null
          related_entity_type?: string | null
          reply_count?: number
          slug?: string
          status?: string
          structured_data?: Json
          tags?: string[]
          thread_type?: string
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "forum_threads_accepted_post_fk"
            columns: ["accepted_post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_threads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "forum_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturers: {
        Row: {
          country: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          slug: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          slug: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          slug?: string
          website?: string | null
        }
        Relationships: []
      }
      marketplace_listings: {
        Row: {
          condition: Database["public"]["Enums"]["listing_condition"]
          created_at: string
          description: string | null
          id: string
          image_urls: Json
          location: string | null
          part_id: string | null
          price_usd: number
          seller_user_id: string
          ships_to: string | null
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          condition?: Database["public"]["Enums"]["listing_condition"]
          created_at?: string
          description?: string | null
          id?: string
          image_urls?: Json
          location?: string | null
          part_id?: string | null
          price_usd: number
          seller_user_id: string
          ships_to?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
        }
        Update: {
          condition?: Database["public"]["Enums"]["listing_condition"]
          created_at?: string
          description?: string | null
          id?: string
          image_urls?: Json
          location?: string | null
          part_id?: string | null
          price_usd?: number
          seller_user_id?: string
          ships_to?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_suppliers: {
        Row: {
          id: string
          in_stock: boolean | null
          last_checked_at: string | null
          part_id: string
          price_usd: number | null
          supplier_id: string
          supplier_url: string | null
        }
        Insert: {
          id?: string
          in_stock?: boolean | null
          last_checked_at?: string | null
          part_id: string
          price_usd?: number | null
          supplier_id: string
          supplier_url?: string | null
        }
        Update: {
          id?: string
          in_stock?: boolean | null
          last_checked_at?: string | null
          part_id?: string
          price_usd?: number | null
          supplier_id?: string
          supplier_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_suppliers_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      part_tags: {
        Row: {
          part_id: string
          tag_id: string
        }
        Insert: {
          part_id: string
          tag_id: string
        }
        Update: {
          part_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_tags_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "compatibility_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          category_id: string
          created_at: string
          datasheet_url: string | null
          description: string | null
          id: string
          image_urls: Json
          manufacturer_id: string
          name: string
          popularity_score: number
          price_type: Database["public"]["Enums"]["price_type"]
          price_usd_high: number | null
          price_usd_low: number | null
          release_year: number | null
          search_tsv: unknown
          sku: string | null
          slug: string
          specs: Json
          status: Database["public"]["Enums"]["part_status"]
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          category_id: string
          created_at?: string
          datasheet_url?: string | null
          description?: string | null
          id?: string
          image_urls?: Json
          manufacturer_id: string
          name: string
          popularity_score?: number
          price_type?: Database["public"]["Enums"]["price_type"]
          price_usd_high?: number | null
          price_usd_low?: number | null
          release_year?: number | null
          search_tsv?: unknown
          sku?: string | null
          slug: string
          specs?: Json
          status?: Database["public"]["Enums"]["part_status"]
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          category_id?: string
          created_at?: string
          datasheet_url?: string | null
          description?: string | null
          id?: string
          image_urls?: Json
          manufacturer_id?: string
          name?: string
          popularity_score?: number
          price_type?: Database["public"]["Enums"]["price_type"]
          price_usd_high?: number | null
          price_usd_low?: number | null
          release_year?: number | null
          search_tsv?: unknown
          sku?: string | null
          slug?: string
          specs?: Json
          status?: Database["public"]["Enums"]["part_status"]
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_flair: {
        Row: {
          accent_color: string | null
          animated_avatar_url: string | null
          badge: string | null
          banner_url: string | null
          frame_style: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          animated_avatar_url?: string | null
          badge?: string | null
          banner_url?: string | null
          frame_style?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          animated_avatar_url?: string | null
          badge?: string | null
          banner_url?: string | null
          frame_style?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          github: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          twitter: string | null
          updated_at: string
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          github?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          twitter?: string | null
          updated_at?: string
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          github?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          twitter?: string | null
          updated_at?: string
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      project_versions: {
        Row: {
          changelog: string | null
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          rpps: Json
          version: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          rpps: Json
          version: string
        }
        Update: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          rpps?: Json
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          difficulty: string | null
          docs_url: string | null
          estimated_cost_usd: number | null
          id: string
          license: string | null
          name: string
          owner_id: string
          repo_url: string | null
          reproducibility_score: number | null
          rpps: Json
          rpps_version: string
          slug: string
          status: string
          summary: string | null
          tags: string[]
          updated_at: string
          version: string
          visibility: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          docs_url?: string | null
          estimated_cost_usd?: number | null
          id?: string
          license?: string | null
          name: string
          owner_id: string
          repo_url?: string | null
          reproducibility_score?: number | null
          rpps?: Json
          rpps_version?: string
          slug: string
          status?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          version?: string
          visibility?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          docs_url?: string | null
          estimated_cost_usd?: number | null
          id?: string
          license?: string | null
          name?: string
          owner_id?: string
          repo_url?: string | null
          reproducibility_score?: number | null
          rpps?: Json
          rpps_version?: string
          slug?: string
          status?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          version?: string
          visibility?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          slug: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          slug: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          slug?: string
          website?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      build_is_visible: {
        Args: { _build_id: string; _viewer: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_accepted_answer: {
        Args: { _post_id?: string; _thread_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      listing_condition: "new" | "like-new" | "used" | "for-parts"
      listing_status: "active" | "sold" | "withdrawn"
      part_status: "active" | "discontinued" | "preorder"
      price_type: "fixed" | "quote" | "range"
      user_role: "hobbyist" | "researcher" | "engineer" | "manufacturer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      listing_condition: ["new", "like-new", "used", "for-parts"],
      listing_status: ["active", "sold", "withdrawn"],
      part_status: ["active", "discontinued", "preorder"],
      price_type: ["fixed", "quote", "range"],
      user_role: ["hobbyist", "researcher", "engineer", "manufacturer"],
    },
  },
} as const
