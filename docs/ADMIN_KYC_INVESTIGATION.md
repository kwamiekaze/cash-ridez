# Admin Panel KYC Investigation - quamiej2023@gmail.com

## Issue Report
**User Email:** quamiej2023@gmail.com  
**Issue:** ID submission shows "failed" status and cannot be opened in admin panel  
**Other Submissions:** Working normally

## Investigation Steps

### 1. Database Query
Check the kyc_submissions table for this user:

```sql
SELECT * FROM kyc_submissions 
WHERE user_email = 'quamiej2023@gmail.com' 
ORDER BY submitted_at DESC;
```

**Also check profiles table:**
```sql
SELECT id, email, display_name, verification_status, id_image_url, verification_submitted_at 
FROM profiles 
WHERE email = 'quamiej2023@gmail.com';
```

### 2. Storage Path Verification
Check if the file exists at the stored path:
- Navigate to Supabase Storage -> id-verifications bucket
- Look for the user's folder (by user_id)
- Verify the file exists and is accessible

**Generate signed URL test:**
```sql
SELECT storage.sign_url(id_image_url, 3600) as signed_url
FROM profiles 
WHERE email = 'quamiej2023@gmail.com';
```

### 3. Common Issues to Check

#### A. Path Format Issues
- **Problem:** Old format using email as folder name may contain unsafe characters
- **Solution:** Migrate to ID-based paths: `{user_id}/id-{timestamp}.{ext}`

#### B. MIME Type Issues
- **Problem:** HEIC files not supported by browsers
- **Solution:** Convert HEIC to JPEG on upload or provide conversion tool

#### C. Storage Bucket Permissions
- **Problem:** Incorrect RLS policies on storage.objects
- **Check:** Verify admin can read from id-verifications bucket

#### D. Expired Signed URLs
- **Problem:** URLs expire after 1 hour
- **Solution:** Regenerate URL when admin opens the submission

### 4. Migration Script

If path migration is needed, run this fix script:

```typescript
// scripts/fix_kyc_broken_assets.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixBrokenKycAssets() {
  // Get all profiles with id_image_url
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, id_image_url')
    .not('id_image_url', 'is', null);

  for (const profile of profiles || []) {
    try {
      // Check if file exists
      const { data: fileData, error: fileError } = await supabase
        .storage
        .from('id-verifications')
        .list(profile.id);

      if (fileError || !fileData || fileData.length === 0) {
        console.log(`Missing file for user ${profile.email}`);
        
        // Update status to failed with note
        await supabase
          .from('profiles')
          .update({ 
            verification_status: 'rejected',
            verification_notes: 'File missing from storage. Please resubmit your ID.'
          })
          .eq('id', profile.id);
          
        continue;
      }

      // Test if signed URL works
      const { data: urlData, error: urlError } = await supabase
        .storage
        .from('id-verifications')
        .createSignedUrl(profile.id_image_url, 3600);

      if (urlError) {
        console.log(`URL generation failed for ${profile.email}:`, urlError);
      } else {
        console.log(`✓ ${profile.email} - File accessible`);
      }
    } catch (error) {
      console.error(`Error processing ${profile.email}:`, error);
    }
  }
}

fixBrokenKycAssets();
```

### 5. Admin Panel Improvements

Add diagnostic information to admin panel:
```typescript
// When displaying KYC submission in admin panel:
const displaySubmission = async (submission) => {
  try {
    // Attempt to generate fresh signed URL
    const { data, error } = await supabase.storage
      .from('id-verifications')
      .createSignedUrl(submission.front_image_url, 3600);
    
    if (error) {
      // Show diagnostic error to admin
      return {
        status: 'error',
        message: `Cannot load file: ${error.message}`,
        submission_id: submission.id,
        storage_path: submission.front_image_url,
        actions: ['Regenerate URL', 'Request Resubmission']
      };
    }
    
    return { status: 'success', url: data.signedUrl };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
};
```

### 6. Resolution Checklist

- [ ] Query kyc_submissions for user record
- [ ] Verify file exists in storage
- [ ] Test signed URL generation
- [ ] Check MIME type compatibility
- [ ] Verify storage bucket permissions
- [ ] Run path migration if needed
- [ ] Test admin panel access post-fix
- [ ] Document root cause in admin log

## Expected Outcome

After investigation and fix:
1. Root cause identified and documented
2. File accessible in admin panel or user notified to resubmit
3. Storage path standardized to prevent future issues
4. Admin panel shows clear diagnostic info for any future failures

## Notes

- Always use service role key for admin operations
- Keep audit log of all manual interventions
- Update storage policies if access issues found
- Consider adding health check for all pending verifications
