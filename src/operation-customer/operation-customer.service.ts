// src/customer-operations/customer-operations.service.ts
import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nService } from 'nestjs-i18n';
import * as streamifier from 'streamifier';

import { Asset, AssetDocument } from '../property/property.schema';
import { Booking, BookingDocument } from '../booking/booking.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service'; // ✅ Correct import

@Injectable()
export class CustomerOperationsService {
  private readonly logger = new Logger(CustomerOperationsService.name);

  constructor(
    @InjectModel(Asset.name) private readonly assetModel: Model<AssetDocument>,
    @InjectModel(Booking.name) private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly i18n: I18nService,
    private readonly cloudinaryService: CloudinaryService, // ✅ Inject the global CloudinaryService directly
  ) {}

// ===========================================================
// 1️⃣ RETRIEVE PROPERTIES BY CATEGORY (AND MERGE BOOKING DATA)
// ===========================================================
async getPropertiesByCategory(category: string, lang?: string) {
  try {
    // 1️⃣ Get all properties matching the category
    const query: any = { category };
    
    // We populate only the merchant here, bookings are handled separately
    const assets = await this.assetModel
      .find(query)
      .populate('merchant', 'fullName email phonenumber businessName acountnumber')
      .lean()
      .exec();

    if (!assets.length) {
      throw new NotFoundException(
        await this.i18n.translate('customer-operation.ERROR_NO_PROPERTY_FOUND', { lang }),
      );
    }
    
    // 2️⃣ Get all bookings related to these properties
    const propertyIds = assets.map((a) => a._id);
    
    const bookings = await this.bookingModel
      .find({ asset: { $in: propertyIds } })
      // Select the fields needed for the customer view
      .select('asset startDate endDate numberOfProperty status') 
      .lean();

    // 3️⃣ Group bookings by property (Asset)
    const bookingMap = bookings.reduce((acc, booking) => {
      // The 'asset' field holds the ObjectId reference back to the Asset
      const propertyId = booking.asset.toString(); 
      if (!acc[propertyId]) acc[propertyId] = [];
      
      // Push only the necessary booking details
      acc[propertyId].push({
        startDate: booking.startDate,
        endDate: booking.endDate,
        numberOfProperty: booking.numberOfProperty,
        status: booking.status, // Include status for clarity
      });
      return acc;
    }, {} as Record<string, any[]>);

    // 4️⃣ Merge asset info with its related booking data
    const properties = assets.map((asset) => {
      const merchant = asset.merchant as any;
      const propertyIdString = asset._id.toString();
      
      // Get the array of bookings for this specific property ID
      const associatedBookings = bookingMap[propertyIdString] || []; 

      return {
        // 🧱 Basic property info
        name: asset.name,
        description: asset.description,
        category: asset.category,
        priceUnit: asset.priceUnit,
        numberOfProperty: asset.numberOfProperty,
        status: asset.status,
        imageUrls: asset.imageUrls || [],

        // 💰 Rental prices
        rentalPrice: {
          perHour: asset.rentalPriceperhour,
          perDay: asset.rentalPriceperday,
          perMonth: asset.rentalPricepermonth,
          perYear: asset.rentalPriceperyear,
        },

        // 🧍 Merchant info
        merchant: {
          name: merchant?.fullName || 'N/A',
          acountnumber: merchant?.acountnumber,
          email: merchant?.email || 'N/A',
          phone: merchant?.phonenumber || 'N/A',
          businessName: merchant?.businessName || 'N/A',
        },

        // 📅 All associated bookings (merged data)
        bookings: associatedBookings, // This array replaces the old 'bookingDetails: null'
      };
    });

    // 5️⃣ Return final response
    return {
      message: await this.i18n.translate(
        'customer-operation.SUCCESS_PROPERTY_FETCHED',
        { lang },
      ),
      category,
      totalProperties: properties.length,
      properties: properties,
    };
  } catch (error) {
    console.error('❌ Error fetching properties:', error);
    throw new InternalServerErrorException(
      await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
    );
  }
}
  // ===========================================================
  // 2️⃣ GET BOOKINGS CREATED BY LOGGED-IN CUSTOMER
  // ===========================================================
  
  async getMyBookings(customerId: Types.ObjectId, lang: string) {
    try {
      const bookings = await this.bookingModel
        .find({ customer: customerId })
        .populate('asset', 'name category numberOfProperty imageUrls')
        .populate('merchant', 'fullName email phonenumber businessName')
        .populate('customer', 'fullName email phonenumber')
        .lean()
        .exec();

      if (!bookings.length) {
        throw new NotFoundException(
          await this.i18n.translate(
            'customer-operation.ERROR_NO_BOOKING_FOUND',
            { lang },
          ),
        );
      }

      return {
        message: await this.i18n.translate(
          'customer-operation.SUCCESS_BOOKINGS_FETCHED',
          { lang },
        ),
        totalBookings: bookings.length,
        bookings: bookings.map((booking) => {
          const asset = booking.asset as any;
          const merchant = booking.merchant as any;
          const customer = booking.customer as any;
          return {
            bookingId: booking._id,
            assetName: asset?.name || 'N/A',
            category: asset?.category || 'N/A',
            numberOfProperty: booking?.numberOfProperty || 0,
            imageUrls: asset?.imageUrls || [],
            priceUnit: booking?.timeInterval || 'N/A',
            startDate: booking.startDate,
            endDate: booking.endDate,
            totalPrice: booking.totalPrice,
            status: booking.status,
            paymentProofPath: booking.paymentProofPath || null, // 👈 Added
            merchant: {
              name: merchant?.fullName || 'N/A',
              email: merchant?.email || 'N/A',
              phone: merchant?.phonenumber || 'N/A',
              businessName: merchant?.businessName || 'N/A',
            },
            bookedBy: {
              name: customer?.fullName || 'N/A',
              email: customer?.email || 'N/A',
              phone: customer?.phonenumber || 'N/A',
            },
          };
        }),
      };
    } catch (error) {
      console.error('❌ Error fetching bookings:', error);
      throw new InternalServerErrorException(
        await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
      );
    }
  }
 // 🧩 Helper — Upload any image to Cloudinary (Reusable)
  // ===========================================================
  private async uploadToCloudinary(file: Express.Multer.File, folder: string): Promise<string> {
  if (!file?.buffer) {
    this.logger.warn('⚠️ No file buffer provided for Cloudinary upload.');
    throw new BadRequestException('Invalid file upload.');
  }

  try {
    const url = await this.cloudinaryService.uploadImage(file, folder); // ✅ use the global CloudinaryService
    this.logger.log(`✅ Uploaded to Cloudinary folder "${folder}"`);
    return url;
  } catch (err) {
    this.logger.error(`❌ Cloudinary upload failed (${folder}):`, err);
    throw new InternalServerErrorException('Image upload failed.');
  }
}

  // ===========================================================
  // 4️⃣ UPLOAD PAYMENT PROOF (Improved)
  // ===========================================================
  async uploadPaymentProof(
    customerId: Types.ObjectId,
    bookingId: Types.ObjectId,
    paymentProofFile: Express.Multer.File,
    lang?: string,
  ) {
    try {
      const booking = await this.bookingModel.findById(bookingId);
      if (!booking) {
        throw new NotFoundException(
          await this.i18n.translate('customer-operation.ERROR_BOOKING_NOT_FOUND', { lang }),
        );
      }

      if (!booking.customer.equals(customerId)) {
        throw new ForbiddenException(
          await this.i18n.translate('customer-operation.ERROR_NOT_OWNER', { lang }),
        );
      }

      if (!paymentProofFile) {
        throw new BadRequestException(
          await this.i18n.translate('customer-operation.ERROR_NO_FILE_UPLOADED', { lang }),
        );
      }

      // ✅ Upload to Cloudinary (reusable helper)
      const paymentProofUrl = await this.uploadToCloudinary(
        paymentProofFile,
        'payment-proofs',
      );

      // ✅ Save the URL in the database
      booking.paymentProofPath = paymentProofUrl;
      await booking.save();

      this.logger.log(`💾 Payment proof saved for booking ${bookingId}`);

      return {
        statusCode: 200,
        message: await this.i18n.translate(
          'customer-operation.SUCCESS_PAYMENT_PROOF_UPLOADED',
          { lang },
        ),
        paymentProofUrl,
      };
    } catch (error) {
      this.logger.error('❌ Error uploading payment proof:', error);
      throw new InternalServerErrorException(
        await this.i18n.translate('customer-operation.ERROR_UPLOAD_FAILED', { lang }),
      );
    }
  }
// ===================== GET PROFILE =====================
  async getMyProfile(customerId: string) {
    if (!Types.ObjectId.isValid(customerId)) throw new BadRequestException('Invalid customer ID.');

    const customer = await this.userModel.findById(customerId).select('-password');
    if (!customer) throw new NotFoundException('Customer not found.');

    return {
      id: customer._id,
      fullName: customer.fullName,
      email: customer.email,
      phonenumber: customer.phonenumber,
      address: customer.address,
      profilePictureUrl: customer.profilePictureUrl || null,
    };
  }
async updateMyProfile(
  customerId: string,
  updateData: any,
  profileImageFile?: Express.Multer.File,
) {
  if (!Types.ObjectId.isValid(customerId)) {
    throw new BadRequestException('Invalid customer ID.');
  }

  try {
    // 1️⃣ Log incoming data for debugging
    this.logger.log(`🔹 Customer ID: ${customerId}`);
    this.logger.log('🔹 Raw updateData received:', updateData);
    if (profileImageFile) this.logger.log('🔹 Profile image received:', profileImageFile.originalname);

    // 2️⃣ Allow only specific fields
    const allowedFields = ['fullName', 'email', 'phonenumber', 'address'];
    const filteredUpdate: Record<string, any> = {};

    for (const key of Object.keys(updateData)) {
      if (
        allowedFields.includes(key) &&
        updateData[key] !== undefined &&
        updateData[key] !== null &&
        updateData[key].toString().trim() !== ''
      ) {
        filteredUpdate[key] = updateData[key].toString().trim();
      }
    }

    // 3️⃣ Upload profile image if provided
    if (profileImageFile) {
      try {
        const url = await this.cloudinaryService.uploadImage(profileImageFile, 'customers');
        filteredUpdate.profilePictureUrl = url;
        this.logger.log('✅ Profile image uploaded to Cloudinary:', url);
      } catch (cloudErr) {
        this.logger.error('❌ Cloudinary upload failed:', cloudErr);
        throw new InternalServerErrorException('Failed to upload profile image.');
      }
    }

    // 4️⃣ Check if there's anything to update
    if (Object.keys(filteredUpdate).length === 0) {
      throw new BadRequestException('No valid fields provided for update.');
    }

    // 5️⃣ Update the user in DB
    const customer = await this.userModel
      .findByIdAndUpdate(customerId, { $set: filteredUpdate }, { new: true, runValidators: true })
      .select('-password');

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    this.logger.log('✅ Profile updated successfully:', customer);

    return {
      message: 'Profile updated successfully.',
      updatedCustomer: {
        id: customer._id,
        fullName: customer.fullName,
        email: customer.email,
        phonenumber: customer.phonenumber,
        address: customer.address,
        profilePictureUrl: customer.profilePictureUrl || null,
      },
    };
  } catch (error) {
    this.logger.error('❌ Failed to update profile:', error);
    // Return the error message if available
    const msg = error?.response?.message || error?.message || 'Failed to update profile.';
    throw new InternalServerErrorException(msg);
  }
}

// ===========================================================
// 3️⃣ GET ALL BOOKINGS (VISIBLE TO ALL LOGGED-IN CUSTOMERS)
// ===========================================================
async getAllBookings(lang: string) {
  try {
    const bookings = await this.bookingModel
      .find()
      .populate('asset', 'name category numberOfProperty imageUrls')
      .populate('merchant', 'email fullName businessName phonenumber')
      .exec(); // Removed .lean() to keep Mongoose documents if needed

    if (!bookings.length) {
      throw new NotFoundException(
        await this.i18n.translate('customer-operation.ERROR_NO_BOOKING_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('customer-operation.SUCCESS_BOOKINGS_FETCHED', { lang }),
      totalBookings: bookings.length,
      bookings: bookings.map((booking) => {
        const asset = booking.asset as any;
        const merchant = booking.merchant as any;
        return {
          bookingId: booking._id,
          propertyName: asset?.name || 'N/A',
          numberOfProperty: booking?.numberOfProperty || 0,
          merchantEmail: merchant?.email || 'N/A',
          merchantPhone: merchant?.phonenumber || 'N/A',
          businessName: merchant?.businessName || 'N/A',
          startDate: booking.startDate,
          endDate: booking.endDate,
          paymentProofPath: booking.paymentProofPath || 'no payment proven',
          imageUrls: asset?.imageUrls || [],
        };
      }),
    };
  } catch (error) {
    console.error('❌ Error fetching all bookings:', error);
    throw new InternalServerErrorException(
      await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
    );
  }
}

// ===========================================================
// 5️⃣ UPDATE BOOKING (BY MANAGER)
// ===========================================================
async updateBookingByManager(
  bookingId: string,
  updateData: Partial<Booking>,
  lang?: string,
) {
  try {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }

    const updatedBooking = await this.bookingModel.findByIdAndUpdate(
      bookingId,
      updateData,
      { new: true, runValidators: true }, // return updated doc + validate
    );

    if (!updatedBooking) {
      throw new NotFoundException(
        await this.i18n.translate('customer-operation.ERROR_BOOKING_NOT_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('customer-operation.SUCCESS_BOOKING_UPDATED', { lang }),
      updatedBooking,
    };
  } catch (error) {
    console.error('❌ Error updating booking by manager:', error);
    throw new InternalServerErrorException(
      await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
    );
  }
}

// ===========================================================
// 6️⃣ DELETE BOOKING (BY MANAGER)
// ===========================================================
async deleteBookingByManager(
  bookingId: string,
  lang?: string,
) {
  try {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }

    const deletedBooking = await this.bookingModel.findByIdAndDelete(bookingId);

    if (!deletedBooking) {
      throw new NotFoundException(
        await this.i18n.translate('customer-operation.ERROR_BOOKING_NOT_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('customer-operation.SUCCESS_BOOKING_DELETED', { lang }),
      bookingId,
    };
  } catch (error) {
    console.error('❌ Error deleting booking by manager:', error);
    throw new InternalServerErrorException(
      await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
    );
  }
}


}