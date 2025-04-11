'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Component that verifies if user profile has first and last name
 * If not, it fetches them from auth.users and updates profiles table
 */
export default function ProfileVerification() {
  useEffect(() => {
    const verifyUserProfile = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check if user has a profile with first and last name
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();

        // If profile exists and has both first and last name, no need to update
        if (profile && profile.first_name && profile.last_name) {
          console.log('Profile already has first and last name');
          return;
        }

        // Extract first and last name from user metadata
        let firstName = '';
        let lastName = '';
        
        // Try to get from user metadata
        if (user.user_metadata) {
          firstName = user.user_metadata.first_name || user.user_metadata.given_name || '';
          lastName = user.user_metadata.last_name || user.user_metadata.family_name || '';
        }

        // For OAuth providers like Google
        if ((!firstName || !lastName) && user.identities && user.identities.length > 0) {
          const identity = user.identities[0];
          if (identity.identity_data) {
            firstName = firstName || identity.identity_data.given_name || identity.identity_data.first_name || '';
            lastName = lastName || identity.identity_data.family_name || identity.identity_data.last_name || '';
          }
        }
        
        // If still no names, try to extract from email (for email login)
        if ((!firstName || !lastName) && user.email) {
          const emailParts = user.email.split('@')[0].split('.');
          if (emailParts.length >= 2) {
            firstName = firstName || emailParts[0].charAt(0).toUpperCase() + emailParts[0].slice(1);
            lastName = lastName || emailParts[1].charAt(0).toUpperCase() + emailParts[1].slice(1);
          } else if (emailParts.length === 1) {
            firstName = firstName || emailParts[0].charAt(0).toUpperCase() + emailParts[0].slice(1);
          }
        }

        // If we have first or last name, update the profile
        if (firstName || lastName) {
          console.log('Updating profile with first and last name from auth data');
          
          // Prepare update data
          const updateData = {
            id: user.id,
            updated_at: new Date()
          };
          
          // Only update fields that have values
          if (firstName) updateData.first_name = firstName;
          if (lastName) updateData.last_name = lastName;
          
          // Update profile
          const { error: updateError } = await supabase
            .from('profiles')
            .upsert(updateData);

          if (updateError) {
            console.error('Error updating profile:', updateError);
          } else {
            console.log('Profile updated successfully with first and last name');
          }
        } else {
          console.log('No first or last name found in auth data');
        }
      } catch (error) {
        console.error('Error in profile verification:', error);
      }
    };

    verifyUserProfile();
  }, []);

  // This component doesn't render anything
  return null;
}