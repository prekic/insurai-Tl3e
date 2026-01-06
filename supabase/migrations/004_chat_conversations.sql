-- Chat Conversations Schema
-- Stores chat history between users and the AI assistant

-- =============================================================================
-- CHAT CONVERSATIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic')),
  policy_ids UUID[] DEFAULT '{}', -- Array of policy IDs referenced in conversation
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message ON chat_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created ON chat_conversations(created_at DESC);

-- =============================================================================
-- CHAT MESSAGES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  provider TEXT, -- Which AI provider generated this response (null for user messages)
  token_usage JSONB, -- { input_tokens, output_tokens, total_tokens }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: Users can only see their own conversations
DROP POLICY IF EXISTS chat_conversations_select_own ON chat_conversations;
CREATE POLICY chat_conversations_select_own ON chat_conversations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_conversations_insert_own ON chat_conversations;
CREATE POLICY chat_conversations_insert_own ON chat_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_conversations_update_own ON chat_conversations;
CREATE POLICY chat_conversations_update_own ON chat_conversations
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_conversations_delete_own ON chat_conversations;
CREATE POLICY chat_conversations_delete_own ON chat_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- Messages: Users can only see messages in their own conversations
DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
CREATE POLICY chat_messages_select ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND chat_conversations.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
CREATE POLICY chat_messages_insert ON chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND chat_conversations.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_delete ON chat_messages;
CREATE POLICY chat_messages_delete ON chat_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND chat_conversations.user_id = auth.uid()
    )
  );

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to update conversation stats after message insert
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversations
  SET
    message_count = (
      SELECT COUNT(*) FROM chat_messages
      WHERE conversation_id = NEW.conversation_id
    ),
    last_message_at = NEW.created_at,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update conversation stats
DROP TRIGGER IF EXISTS chat_messages_stats_trigger ON chat_messages;
CREATE TRIGGER chat_messages_stats_trigger
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_stats();

-- Function to auto-generate conversation title from first user message
CREATE OR REPLACE FUNCTION generate_conversation_title()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if this is the first user message and title is still default
  IF NEW.role = 'user' THEN
    UPDATE chat_conversations
    SET title = LEFT(NEW.content, 50) || CASE WHEN LENGTH(NEW.content) > 50 THEN '...' ELSE '' END
    WHERE id = NEW.conversation_id
    AND title = 'New Conversation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate title
DROP TRIGGER IF EXISTS chat_messages_title_trigger ON chat_messages;
CREATE TRIGGER chat_messages_title_trigger
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION generate_conversation_title();

-- Function to get recent conversations for a user
CREATE OR REPLACE FUNCTION get_recent_conversations(p_limit INTEGER DEFAULT 20)
RETURNS SETOF chat_conversations AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM chat_conversations
  WHERE user_id = auth.uid()
  ORDER BY last_message_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get messages for a conversation
CREATE OR REPLACE FUNCTION get_conversation_messages(p_conversation_id UUID)
RETURNS TABLE (
  id UUID,
  role TEXT,
  content TEXT,
  provider TEXT,
  token_usage JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Verify user owns this conversation
  IF NOT EXISTS (
    SELECT 1 FROM chat_conversations
    WHERE chat_conversations.id = p_conversation_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Conversation not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    cm.id,
    cm.role,
    cm.content,
    cm.provider,
    cm.token_usage,
    cm.created_at
  FROM chat_messages cm
  WHERE cm.conversation_id = p_conversation_id
  ORDER BY cm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
