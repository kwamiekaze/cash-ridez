# Storage Buckets Used in CashRidez

This document lists all storage buckets referenced in the application code and their usage.

## 🪣 Buckets Found in Database

(Run `npm run mig:export` to populate from database)

After export, check: `migration/export/09_storage_buckets.sql`

## 📁 Buckets Referenced in Code

### 1. profile-pictures (PUBLIC)

**Purpose:** User profile avatars

**Code References:**
- `src/pages/Profile.tsx` - Upload and display profile pictures
- `src/components/UserChip.tsx` - Display user avatars
- `src/components/AdminBadge.tsx` - Display admin avatars
- `src/components/UserDetailDialog.tsx` - Show user profile pictures

**Expected Configuration:**
- Public: ✅ Yes (needs public read access)
- File size limit: 5MB recommended
- Allowed MIME types: `['image/png', 'image/jpeg', 'image/jpg', 'image/webp']`

**RLS Policies Needed:**
```sql
-- Anyone can view profile pictures (public bucket)
CREATE POLICY "Public can view profile pictures"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-pictures');

-- Users can upload their own profile picture
CREATE POLICY "Users can upload own profile picture"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can update their own profile picture
CREATE POLICY "Users can update own profile picture"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own profile picture
CREATE POLICY "Users can delete own profile picture"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

### 2. id-verifications (PRIVATE)

**Purpose:** KYC/identity verification document uploads

**Code References:**
- `src/pages/Onboarding.tsx` - Upload ID documents (front, back, selfie)
- `src/components/AdminDashboard.tsx` - Admin reviews verification documents
- Edge function: `send-verification-notification` - Generates signed URLs for admins

**Expected Configuration:**
- Public: ❌ No (sensitive documents)
- File size limit: 10MB recommended
- Allowed MIME types: `['image/png', 'image/jpeg', 'image/jpg', 'image/pdf']`

**RLS Policies Needed:**
```sql
-- Users can upload their own ID documents
CREATE POLICY "Users can upload own ID documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'id-verifications' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view their own ID documents
CREATE POLICY "Users can view own ID documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'id-verifications' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins can view all ID documents
CREATE POLICY "Admins can view all ID documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'id-verifications' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Admins can delete ID documents
CREATE POLICY "Admins can delete ID documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'id-verifications' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);
```

---

### 3. ride-notes (PRIVATE)

**Purpose:** Attachments/images for ride-specific notes

**Code References:**
- `src/pages/CreateRideRequest.tsx` - Upload note images when creating rides
- `src/components/TripCard.tsx` - Display ride note images
- `src/pages/TripDetails.tsx` - Show ride note attachments

**Expected Configuration:**
- Public: ❌ No (visible only to ride participants)
- File size limit: 5MB recommended
- Allowed MIME types: `['image/png', 'image/jpeg', 'image/jpg']`

**RLS Policies Needed:**
```sql
-- Users can upload notes for their own rides
CREATE POLICY "Users can upload ride notes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ride-notes' 
  AND EXISTS (
    SELECT 1 FROM public.ride_requests
    WHERE rider_id = auth.uid()
    AND id::text = (storage.foldername(name))[1]
  )
);

-- Ride participants can view ride notes
CREATE POLICY "Participants can view ride notes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ride-notes' 
  AND (
    EXISTS (
      SELECT 1 FROM public.ride_requests
      WHERE id::text = (storage.foldername(name))[1]
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Admins can view all ride notes
-- (included in above policy)

-- Riders can delete their own ride notes
CREATE POLICY "Riders can delete own ride notes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ride-notes' 
  AND EXISTS (
    SELECT 1 FROM public.ride_requests
    WHERE rider_id = auth.uid()
    AND id::text = (storage.foldername(name))[1]
  )
);
```

---

### 4. chat-attachments (PRIVATE)

**Purpose:** File attachments in ride-specific chats

**Code References:**
- `src/pages/ChatPage.tsx` - Upload/send attachments in chat
- `src/components/FloatingChat.tsx` - Display chat attachments

**Expected Configuration:**
- Public: ❌ No (visible only to ride participants)
- File size limit: 10MB recommended
- Allowed MIME types: `['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'text/plain']`

**RLS Policies Needed:**
```sql
-- Ride participants can upload chat attachments
CREATE POLICY "Participants can upload chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments' 
  AND EXISTS (
    SELECT 1 FROM public.ride_requests
    WHERE id::text = (storage.foldername(name))[1]
    AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
  )
);

-- Ride participants can view chat attachments
CREATE POLICY "Participants can view chat attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments' 
  AND (
    EXISTS (
      SELECT 1 FROM public.ride_requests
      WHERE id::text = (storage.foldername(name))[1]
      AND (rider_id = auth.uid() OR assigned_driver_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Admins can view all chat attachments
-- (included in above policy)
```

---

## ✅ Migration Checklist

When migrating to new Supabase project:

- [ ] Create all 4 buckets in new project (Storage → Create bucket)
- [ ] Set correct public/private visibility for each
- [ ] Configure file size limits
- [ ] Set allowed MIME types
- [ ] Create all RLS policies on `storage.objects` table
- [ ] Test upload/download with test user account
- [ ] Verify admins can access all files
- [ ] Verify regular users can only access their own files
- [ ] Test ride participant access to ride-notes and chat-attachments

## 🔍 Verification Script

After migration, test each bucket:

```javascript
// Test profile-pictures (public)
const { data: publicUpload } = await supabase.storage
  .from('profile-pictures')
  .upload(`${userId}/avatar.jpg`, file);

// Test id-verifications (private)
const { data: idUpload } = await supabase.storage
  .from('id-verifications')
  .upload(`${userId}/id-front.jpg`, file);

// Test ride-notes (private, ride-scoped)
const { data: noteUpload } = await supabase.storage
  .from('ride-notes')
  .upload(`${rideId}/note.jpg`, file);

// Test chat-attachments (private, ride-scoped)
const { data: chatUpload } = await supabase.storage
  .from('chat-attachments')
  .upload(`${rideId}/attachment.pdf`, file);
```

## 🚨 Security Notes

1. **NEVER make id-verifications public** - Contains sensitive identity documents
2. **Ride-scoped buckets** - Ensure RLS checks ride participation
3. **Admin access** - Admins should have view access to all private buckets
4. **File size limits** - Set reasonable limits to prevent abuse
5. **MIME type restrictions** - Only allow expected file types

---

**Last Updated:** Auto-generated during migration setup
**Cross-reference with:** `migration/export/09_storage_buckets.sql`
